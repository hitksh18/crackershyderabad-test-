'use strict';

/* ---------------------------------------------------------------------------
   Event ingestion.

   Every behavioural signal (search, view, click, like, add-to-cart, purchase…)
   lands here and is fanned out to:
     • userEvents            – append-only audit trail
     • productMetrics        – lifetime counters + per-day counters (windows)
     • userPreferences       – learned preference vector (decayed weights)
     • sessionContext        – session search/click/cart history (attribution)
     • searchKeywordStats    – search frequency + conversion attribution
     • zeroResultAggregates  – searches that returned nothing (gaps)
   ------------------------------------------------------------------------- */

const { Timestamp, FieldValue, FieldPath } = require('firebase-admin/firestore');
const { analyzeSearch } = require('./searchIntent');
const { loadConfig } = require('./config');

const EVENT_TYPES = new Set([
  'SEARCH',
  'PAGE_VIEW',
  'PRODUCT_VIEW',
  'PRODUCT_CLICK',
  'PRODUCT_LIKE',
  'CATEGORY_VIEW',
  'ADD_TO_CART',
  'REMOVE_FROM_CART',
  'CHECKOUT_START',
  'PURCHASE',
  'PURCHASE_COMPLETE',
  'PRODUCT_SHARE',
]);

function dayKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}`;
}

/** Validate and normalise an incoming event payload. */
function validateEvent(body, { authUid = null } = {}) {
  const type = String(body?.type || '').toUpperCase();
  if (!EVENT_TYPES.has(type)) {
    return { error: `Unsupported event type. Allowed: ${[...EVENT_TYPES].join(', ')}` };
  }

  const sessionId = String(body?.sessionId || '').slice(0, 128);
  // userId is bound to the verified caller only; a client-supplied body.userId
  // is ignored. Otherwise anyone could POST events under another account's id
  // and corrupt its learned preference vector (userPreferences/{userId}).
  // Guests — no verified token — stay strictly session-scoped.
  const userId = authUid ? String(authUid).slice(0, 128) : null;
  if (!sessionId && !userId) {
    return { error: 'sessionId (or userId) is required to attribute events' };
  }

  return {
    value: {
      type,
      sessionId: sessionId || `anon-${userId}`,
      userId,
      productId: String(body?.productId || '').slice(0, 128) || null,
      category: String(body?.category || '').slice(0, 80) || null,
      searchQuery: String(body?.searchQuery || '').slice(0, 200) || null,
      quantity: Math.max(1, Number(body?.quantity) || 1),
      total: Number(body?.total) || 0,
      items: Array.isArray(body?.items) ? body.items.slice(0, 100) : null,
      source: String(body?.source || '').slice(0, 40) || 'unknown',
      path: String(body?.path || '').slice(0, 200) || null,
      referrer: String(body?.referrer || '').slice(0, 200) || null,
      ts: Timestamp.now(),
    },
  };
}

const EVENT_COUNTERS = {
  PRODUCT_VIEW: 'views',
  PRODUCT_CLICK: 'clicks',
  PRODUCT_LIKE: 'likes',
  ADD_TO_CART: 'addToCart',
  REMOVE_FROM_CART: 'addToCart',
  CHECKOUT_START: 'checkoutStarts',
  PURCHASE: 'purchases',
  PURCHASE_COMPLETE: 'purchases',
  PRODUCT_SHARE: 'shares',
};

/** Apply a single event to the product's metrics (lifetime + daily windows). */
async function applyProductMetrics(db, event) {
  if (!event.productId) return;

  const ref = db.collection('productMetrics').doc(event.productId);
  const day = dayKey();
  const increments = { updatedAtMs: Date.now(), id: event.productId };

  const field = EVENT_COUNTERS[event.type];
  if (field) {
    const delta = event.type === 'REMOVE_FROM_CART' ? -1 : 1;
    increments[field] = FieldValue.increment(delta);
    increments[new FieldPath('days', day, field)] = FieldValue.increment(delta);
  }

  if (event.type === 'PURCHASE' || event.type === 'PURCHASE_COMPLETE') {
    const units = event.items?.reduce((sum, it) => sum + (Number(it?.quantity) || 1), 0) || event.quantity;
    const revenue =
      event.items?.reduce(
        (sum, it) => sum + (Number(it?.price) || 0) * (Number(it?.quantity) || 1),
        0,
      ) || event.total;
    increments.unitsSold = FieldValue.increment(units);
    increments.revenue = FieldValue.increment(revenue);
    increments[new FieldPath('days', day, 'unitsSold')] = FieldValue.increment(units);
    increments[new FieldPath('days', day, 'revenue')] = FieldValue.increment(revenue);
  }

  await ref.set(increments, { merge: true });
}

/** Update search statistics (keyword frequency + zero-result gaps). */
async function applySearchStats(db, event) {
  const query = String(event.searchQuery || '').trim();
  if (!query) return null;

  const analysis = analyzeSearch(query);
  const keyword = analysis.normalized || query.toLowerCase().trim();

  await db
    .collection('searchKeywordStats')
    .doc(keyword)
    .set(
      {
        query,
        normalizedQuery: keyword,
        categoryIntent: analysis.category || null,
        count: FieldValue.increment(1),
        lastSearchedAt: Timestamp.now(),
      },
      { merge: true },
    );

  if (event.resultsCount === 0) {
    await db
      .collection('zeroResultAggregates')
      .doc(keyword)
      .set(
        {
          query,
          normalizedQuery: keyword,
          categoryIntent: analysis.category || null,
          count: FieldValue.increment(1),
          lastSearchedAt: Timestamp.now(),
        },
        { merge: true },
      );
  }

  return analysis;
}

/** Update the session context (search attribution + browsing trail). */
async function applySessionContext(db, event) {
  if (!event.sessionId) return;
  const ref = db.collection('sessionContext').doc(event.sessionId);
  const nowMs = Date.now();
  const patch = { updatedAtMs: nowMs, lastEventType: event.type, lastEventAt: Timestamp.now() };

  if (event.type === 'SEARCH') {
    patch.searches = FieldValue.arrayUnion({ q: String(event.searchQuery || '').slice(0, 200), ts: nowMs });
    patch.searchCount = FieldValue.increment(1);
  } else if (event.type === 'PRODUCT_VIEW') {
    patch.views = FieldValue.arrayUnion(event.productId);
  } else if (event.type === 'ADD_TO_CART') {
    patch.carted = FieldValue.arrayUnion(event.productId);
  } else if (event.type === 'REMOVE_FROM_CART') {
    patch.carted = FieldValue.arrayRemove(event.productId);
  } else if (event.type === 'PURCHASE' || event.type === 'PURCHASE_COMPLETE') {
    const ids = (event.items || []).map((it) => String(it?.id || '')).filter(Boolean);
    if (ids.length) patch.purchased = FieldValue.arrayUnion(...ids);
    patch.orderCount = FieldValue.increment(1);
    patch.totalSpent = FieldValue.increment(Number(event.total) || 0);
  } else if (event.type === 'PRODUCT_CLICK') {
    patch.clicked = FieldValue.arrayUnion(event.productId);
  } else if (event.type === 'PRODUCT_LIKE') {
    patch.liked = FieldValue.arrayUnion(event.productId);
  }

  await ref.set(patch, { merge: true });
}

/** Attribute cart adds to the searches that preceded them (search→purchase). */
async function attributeSearchConversion(db, event) {
  if (!event.sessionId || !event.productId) return;
  if (!['ADD_TO_CART', 'PURCHASE', 'PURCHASE_COMPLETE'].includes(event.type)) return;

  try {
    const snap = await db.collection('sessionContext').doc(event.sessionId).get();
    if (!snap.exists) return;
    const ctx = snap.data();
    const recentSearches = (ctx.searches || []).slice(-2);
    if (!recentSearches.length) return;

    for (const s of recentSearches) {
      const keyword = analyzeSearch(s.q).normalized || String(s.q || '').toLowerCase().trim();
      if (!keyword) continue;
      const ref = db.collection('searchKeywordStats').doc(keyword);
      await ref.set(
        {
          [event.type === 'ADD_TO_CART' ? 'cartConversions' : 'purchaseConversions']:
            FieldValue.increment(1),
        },
        { merge: true },
      );
    }
  } catch (error) {
    console.warn('[rec] search attribution failed:', error.message);
  }
}

/** Map a price to a preference band key. */
function priceBand(price) {
  if (!Number.isFinite(price) || price <= 0) return null;
  if (price < 200) return 'lt200';
  if (price < 500) return '200-500';
  if (price < 1000) return '500-1000';
  if (price < 2000) return '1000-2000';
  if (price < 4000) return '2000-4000';
  return 'gt4000';
}

/** Learn from the event: update the user's preference vector. */
async function applyPreferences(db, event, config) {
  const profileId = event.userId || event.sessionId;
  if (!profileId) return;

  const ref = db.collection('userPreferences').doc(profileId);
  const doc = await ref.get().catch(() => null);
  const current = doc?.exists ? doc.data() : {};
  const weights = config.behaviorWeights || {};
  const delta = Number(weights[event.type] || 0);
  if (delta === 0 && event.type !== 'PRODUCT_VIEW' && event.type !== 'SEARCH') return;

  const nowMs = Date.now();
  const patch = {
    profileId,
    kind: event.userId ? 'user' : 'session',
    updatedAtMs: nowMs,
  };

  if (event.type === 'PRODUCT_VIEW') {
    const views = (current.views || []).slice(-(config.preference?.maxViewHistory || 60));
    views.push(event.productId);
    patch.views = views;
  }

  if (event.type === 'SEARCH') {
    const searches = (current.searchQueries || []).slice(-(config.preference?.maxSearchHistory || 12));
    searches.push(String(event.searchQuery || '').slice(0, 200));
    patch.searchQueries = searches;
    patch.searchCount = FieldValue.increment(1);
  }

  if (event.productId) {
    let product = null;
    try {
      const p = await db.collection('products').doc(event.productId).get();
      if (p.exists) product = p.data();
    } catch {
      /* product may not exist; the event is still recorded */
    }

    if (product) {
      const cats = product.categories || (product.category ? [product.category] : []);
      for (const cat of cats) {
        patch[new FieldPath('categoryPrefs', String(cat).toLowerCase())] = FieldValue.increment(delta || 0.2);
      }
      const brand = product.brand?.name || product.brand;
      if (brand) {
        patch[new FieldPath('brandPrefs', String(brand).toLowerCase())] = FieldValue.increment(delta || 0.2);
      }
      const price = Number(product.discountPrice || product.onlinePrice || product.price || 0);
      const band = priceBand(price);
      if (band) patch[new FieldPath('priceBands', band)] = FieldValue.increment(delta || 0.2);
    }
  }

  if (event.total && ['PURCHASE', 'PURCHASE_COMPLETE'].includes(event.type)) {
    patch.orderCount = FieldValue.increment(1);
    patch.totalSpent = FieldValue.increment(Number(event.total) || 0);
  }

  await ref.set(patch, { merge: true });
}

/**
 * Entry point: validate + fan out an event. Returns the search analysis for
 * SEARCH events so the caller can echo it back to the client.
 */
async function recordEvent(db, body, opts = {}) {
  const { value, error } = validateEvent(body, opts);
  if (error) return { error };

  const config = await loadConfig(db);

  const tasks = [db.collection('userEvents').add(value)];
  tasks.push(applyProductMetrics(db, value));

  if (value.type === 'SEARCH') {
    tasks.push(
      applySearchStats(db, { ...value, resultsCount: Number(body?.resultsCount) || 0 }).then(
        (analysis) => {
          value.analysis = analysis;
          return analysis;
        },
      ),
    );
  }

  tasks.push(applySessionContext(db, value));
  tasks.push(attributeSearchConversion(db, value));
  tasks.push(applyPreferences(db, value, config));

  const results = await Promise.allSettled(tasks);
  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length) {
    console.error(
      `[rec] ${failures.length} event fan-out task(s) failed:`,
      failures.map((f) => f.reason?.message),
    );
  }

  return { ok: true, type: value.type, analysis: value.analysis || null };
}

module.exports = {
  EVENT_TYPES,
  validateEvent,
  recordEvent,
  priceBand,
  dayKey,
};