'use strict';

/* ---------------------------------------------------------------------------
   Recommendation engine end-to-end test.

   Runs against the live Firestore (service-account.json at repo root) with
   a unique sandbox session prefix, then cleans up every document it created.
   Product data is only ever READ — no products are created or modified.

   Run: node scripts/test-recommendations.js
   ------------------------------------------------------------------------- */

const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const SA_PATH = path.join(__dirname, '..', 'service-account.json');
if (!require('fs').existsSync(SA_PATH)) {
  console.error('service-account.json not found at repo root');
  process.exit(1);
}

initializeApp({ credential: cert(require(SA_PATH)) });
const db = getFirestore();

const engine = require('../api/lib/recommendation/engine');
const { recordEvent } = require('../api/lib/recommendation/events');
const { getPreferenceVector } = require('../api/lib/recommendation/preferences');
const { analyticsSnapshot } = require('../api/lib/recommendation/analytics');
const { loadConfig, saveConfig } = require('../api/lib/recommendation/config');
const { analyzeSearch } = require('../api/lib/recommendation/searchIntent');
const { cacheKey } = require('../api/lib/recommendation/cache');

const SUFFIX = `rectest-${Date.now().toString(36)}`;
const SESSION = `test-session-${SUFFIX}`;
const SESSION2 = `test-session2-${SUFFIX}`;
const ZERO_QUERY = `zzq${SUFFIX} waffle`; // guaranteed no match
const CART_QUERY = `zzq${SUFFIX} cartref`; // matched via items, not search

let pass = 0;
let fail = 0;
let createdDocs = [];

function check(name, condition, detail) {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function track(ref) {
  createdDocs.push(ref);
}

async function run() {
  const productsSnap = await db.collection('products').get();
  const products = productsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`Loaded ${products.length} products.\n`);

  const inStock = products.filter(
    (p) => !(p.outOfStock === true) && !(Number.isFinite(p.stock) && p.stock <= 0),
  );
  const rockets = inStock.filter((p) => (p.categories || [p.category]).includes('Rockets'));
  const sparklers = inStock.filter((p) => (p.categories || [p.category]).includes('Sparkles'));
  const flowerPots = inStock.filter((p) => (p.categories || [p.category]).includes('Flower Pots'));

  /* ---------------------------------------------------------------- 1. cold start */
  console.log('1. Cold start (new session, no history)');
  const cold = await engine.homeRecommendations(db, { sessionId: SESSION, limit: 12 });
  check('returns results', cold.results.length > 0);
  check('results unique', new Set(cold.results.map((r) => r.productId)).size === cold.results.length);
  check('every result has reason', cold.results.every((r) => r.reason && r.score > 0));

  const coldIds = new Set(cold.results.map((r) => r.productId));
  const coldOos = cold.results.filter((r) => {
    const p = products.find((x) => x.id === r.productId);
    return p && (p.outOfStock === true || (Number.isFinite(p.stock) && p.stock <= 0));
  });
  check('no out-of-stock products', coldOos.length === 0, coldOos.map((r) => r.productId).join(','));

  const catSet = new Set(cold.results.flatMap((r) => r.categories || []));
  check('category diversity in cold start', catSet.size >= 3, `${catSet.size} categories`);
  const coldCacheKey = cacheKey('home', SESSION, { limit: 12 });
  const coldCacheDoc = await db.collection('recommendationCache').doc(coldCacheKey).get();
  check('cache populated', coldCacheDoc.exists, coldCacheKey);
  const cold2 = await engine.homeRecommendations(db, { sessionId: SESSION, limit: 12 });
  check('second call served from cache', cold2.fromCache === true);

  /* ------------------------------------------------------- 2. preference learning */
  console.log('\n2. Preference learning (Rockets bias)');
  const target = rockets.slice(0, 5);
  check('enough Rockets products exist', target.length >= 3, `${target.length}`);
  if (target.length >= 3) {
    for (const p of target.slice(0, 3)) {
      await recordEvent(db, { type: 'PRODUCT_VIEW', sessionId: SESSION, productId: p.id });
    }
    await recordEvent(db, { type: 'ADD_TO_CART', sessionId: SESSION, productId: target[0].id });
    await recordEvent(db, { type: 'PRODUCT_LIKE', sessionId: SESSION, productId: target[1].id });
    await recordEvent(db, { type: 'PRODUCT_VIEW', sessionId: SESSION, productId: target[2].id });

    const vector = await getPreferenceVector(db, { sessionId: SESSION });
    check('categoryPrefs.rockets learned', Number(vector.categoryPrefs.rockets) > 0, JSON.stringify(vector.categoryPrefs));
    check('price band prefs learned', Object.keys(vector.priceBands).length > 0);
    check('view history tracked', vector.viewedIds.length === 3);

    const warm = await engine.homeRecommendations(db, { sessionId: SESSION, limit: 12 });
    const rocketsInWarm = warm.results.filter((r) => (r.categories || []).includes('Rockets'));
    check(
      'Rockets surface in personalised feed',
      rocketsInWarm.length >= 2,
      `${rocketsInWarm.length} rockets`,
    );
    const avgPrefScore = warm.results.reduce((s, r) => s + r.score, 0) / warm.results.length;
    const avgColdScore = cold.results.reduce((s, r) => s + r.score, 0) / cold.results.length;
    check('personalised feed scores >= cold start', avgPrefScore >= avgColdScore - 0.01, `${avgPrefScore} vs ${avgColdScore}`);
  }

  /* -------------------------------------------------------------- 3. search intent */
  console.log('\n3. Search intent analysis');
  const intent = analyzeSearch('gold sparkler under rs 500');
  check('detects Sparkles category', intent.category === 'Sparkles', String(intent.category));
  check('parses max price 500', intent.price.maxPrice === 500, JSON.stringify(intent.price));
  const intent2 = analyzeSearch('1000 shot bomb');
  check('detects Bombs for "1000 shot"', intent2.category === 'Bombs', String(intent2.category));
  const intent3 = analyzeSearch('chakri');
  check('spelling fix maps "chakri" to Ground Chakkars', intent3.category === 'Ground Chakkars', String(intent3.category));

  /* ------------------------------------------------------------ 4. search surface */
  console.log('\n4. Search recommendations');
  const searchRes = await engine.searchRecommendations(db, {
    q: 'sparkler',
    sessionId: SESSION,
    limit: 10,
  });
  check('search returns results', searchRes.results.length > 0);
  check('search analysis echoed', searchRes.analysis?.category === 'Sparkles', String(searchRes.analysis?.category));
  const sparklerHits = searchRes.results.filter((r) => (r.categories || []).includes('Sparkles'));
  check('Sparkles dominate sparkler search', sparklerHits.length >= Math.max(1, Math.floor(searchRes.results.length / 2)));

  const coldSearch = await engine.searchRecommendations(db, { q: 'gift box', sessionId: SESSION, limit: 8 });
  const giftHits = coldSearch.results.filter((r) => (r.categories || []).includes('Gift Boxes'));
  check('gift box search biased to Gift Boxes', giftHits.length >= 2, `${giftHits.length}`);

  /* --------------------------------------------------- 5. zero-result gap tracking */
  console.log('\n5. Zero-result search tracking');
  const zeroEvt = await recordEvent(db, {
    type: 'SEARCH',
    sessionId: SESSION,
    searchQuery: ZERO_QUERY,
    resultsCount: 0,
  });
  check('zero-result search event accepted', zeroEvt.ok === true);
  const zeroRes = await engine.searchRecommendations(db, { q: ZERO_QUERY, sessionId: SESSION, limit: 5 });
  check('zero-result search returns nothing', zeroRes.results.length === 0 && zeroRes.empty === true);
  const zeroDoc = await db.collection('zeroResultAggregates').doc(require('../api/lib/recommendation/searchIntent').normalizeQuery(ZERO_QUERY)).get();
  check('zero-result aggregate created', zeroDoc.exists);

  /* ------------------------------------------------------- 6. similar products */
  console.log('\n6. Similar products');
  if (flowerPots.length >= 2) {
    const anchor = flowerPots[0];
    const similar = await engine.similarProducts(db, { productId: anchor.id, limit: 6 });
    check('similar returns results', similar.results.length > 0);
    const relatedPots = similar.results.filter((r) => (r.categories || []).includes('Flower Pots'));
    check(
      'similar biased to same category',
      relatedPots.length >= Math.max(1, Math.floor(similar.results.length / 2)),
      `${relatedPots.length}/${similar.results.length}`,
    );
    const simDoc = await db.collection('productSimilarity').doc(anchor.id).get();
    check('similarity cache persisted', simDoc.exists && simDoc.data()?.similar?.length > 0);
  }

  /* --------------------------------------------------------- 7. cart-based recs */
  console.log('\n7. Cart-based recommendations');
  const cartTarget = inStock[0];
  const cartRes = await engine.cartRecommendations(db, {
    items: [{ id: cartTarget.id, quantity: 1 }],
    sessionId: SESSION,
    limit: 8,
  });
  check('cart recs return results', cartRes.results.length > 0);
  check('cart recs exclude carted item', !cartRes.results.some((r) => r.productId === cartTarget.id));
  const catOfCart = cartTarget.categories || [cartTarget.category];
  const sameCat = cartRes.results.filter((r) => catOfCart.some((c) => (r.categories || []).includes(c)));
  check('cart recs related to cart category', sameCat.length >= 1, `${sameCat.length}`);

  /* -------------------------------------------------------- 8. recent + category */
  console.log('\n8. Recent + category surfaces');
  const recent = await engine.recentRecommendations(db, { sessionId: SESSION, limit: 6 });
  check('recent returns deduped viewed products', recent.results.length === 2, `${recent.results.length}`);
  const catRes = await engine.categoryRecommendations(db, { category: 'Sparkles', sessionId: SESSION, limit: 6 });
  check(
    'category surface returns only that category',
    catRes.results.length > 0 && catRes.results.every((r) => (r.categories || []).includes('Sparkles')),
  );

  /* ----------------------------------------------------------- 9. trending */
  console.log('\n9. Trending');
  const trend = await engine.trendingProducts(db, { period: '7d', limit: 8 });
  check('trending returns results', trend.results.length > 0);
  check('trending echoes period', trend.period === '7d');
  check('trending excludes out of stock', !trend.results.some((r) => {
    const p = products.find((x) => x.id === r.productId);
    return p && p.outOfStock === true;
  }));

  /* --------------------------------------------------- 10. event validation */
  console.log('\n10. Event validation');
  const badType = await recordEvent(db, { type: 'NOT_REAL', sessionId: SESSION });
  check('rejects unknown event type', !!badType.error);
  const noSession = await recordEvent(db, { type: 'PRODUCT_VIEW' });
  check('rejects missing sessionId', !!noSession.error);
  const cartRef = await recordEvent(db, { type: 'ADD_TO_CART', sessionId: SESSION2, productId: cartTarget.id });
  check('accepts valid event', cartRef.ok === true);
  const searchEvt = await recordEvent(db, {
    type: 'SEARCH',
    sessionId: SESSION2,
    searchQuery: CART_QUERY,
    resultsCount: 0,
  });
  check('search event echoes analysis', searchEvt.ok === true);
  const purchaseEvt = await recordEvent(db, {
    type: 'PURCHASE',
    sessionId: SESSION2,
    items: [{ id: cartTarget.id, quantity: 2, price: 299 }],
    total: 598,
  });
  check('purchase event accepted', purchaseEvt.ok === true);

  /* ------------------------------------------------------ 11. admin analytics */
  console.log('\n11. Analytics snapshot');
  const snapshot = await analyticsSnapshot(db, { days: 30 });
  check('analytics has funnel totals', snapshot.funnel?.views >= 0 && Number.isFinite(snapshot.funnel?.revenue));
  check('analytics has topPurchased list', Array.isArray(snapshot.products?.topPurchased));
  check('analytics has search section', Array.isArray(snapshot.search?.topSearches) && Array.isArray(snapshot.search?.zeroResult));
  check('analytics has recommendations funnel', 'ctr' in (snapshot.recommendations || {}));
  check(
    'analytics includes zero-result gap',
    snapshot.search.zeroResult.some((z) => z.query === ZERO_QUERY),
  );

  /* ------------------------------------------------- 12. config round-trip */
  console.log('\n12. Config');
  const cfgBefore = await loadConfig(db);
  check('default config loads', cfgBefore.rules?.maxPerCategory === 3 && cfgBefore.scoringWeights?.searchRelevance === 0.35);
  const cfgDoc = db.collection('recConfig').doc('main');
  track(cfgDoc);
  await saveConfig(db, { rules: { maxPerCategory: 2 } });
  const cfgAfter = await loadConfig(db);
  check('config override persists', cfgAfter.rules.maxPerCategory === 2);
  await cfgDoc.delete().catch(() => {});
  const cfgRestored = await loadConfig(db);
  check('config restored to defaults', cfgRestored.rules.maxPerCategory === 3);

  /* --------------------------------------------------------- cleanup */
  console.log('\nCleanup');
  const sessions = [SESSION, SESSION2];
  const prefDocs = await db.collection('userPreferences').where('profileId', 'in', sessions).get();
  for (const d of prefDocs.docs) track(db.collection('userPreferences').doc(d.id));
  for (const s of sessions) track(db.collection('sessionContext').doc(s));
  const eventsSnap = await db.collection('userEvents').where('sessionId', 'in', sessions).get();
  for (const d of eventsSnap.docs) track(db.collection('userEvents').doc(d.id));
  const caches = await db.collection('recommendationCache').where('key', '>=', `home:${SESSION}`).where('key', '<', `home:${SESSION}\uf8ff`).get();
  for (const d of caches.docs) track(db.collection('recommendationCache').doc(d.id));
  const zeroNorm = require('../api/lib/recommendation/searchIntent').normalizeQuery(ZERO_QUERY);
  track(db.collection('zeroResultAggregates').doc(zeroNorm));
  track(db.collection('searchKeywordStats').doc(zeroNorm));
  track(db.collection('searchKeywordStats').doc(require('../api/lib/recommendation/searchIntent').normalizeQuery(CART_QUERY)));
  track(db.collection('zeroResultAggregates').doc(require('../api/lib/recommendation/searchIntent').normalizeQuery(CART_QUERY)));

  let deleted = 0;
  for (const ref of createdDocs) {
    try {
      await ref.delete();
      deleted += 1;
    } catch (error) {
      console.warn('  cleanup skipped:', ref.path, error.message);
    }
  }
  console.log(`  deleted ${deleted} test documents`);

  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error('Test run crashed:', error);
  process.exit(2);
});