'use strict';

/* ---------------------------------------------------------------------------
   Preference profile reading.

   Reads the userPreferences doc for a user (Firebase UID) or guest
   (sessionId), applies exponential time decay to the learned weights and
   returns a normalised preference vector:
     { categoryPrefs: [{category, weight}], priceBands: {...}, brandPrefs: {...},
       viewedIds, cartedIds, purchasedIds, searchQueries, orderCount, avgOrderValue }
   ------------------------------------------------------------------------- */

const { loadConfig } = require('./config');
const { priceBand } = require('./events');
const { extractNestedMap } = require('./nested');

function decay(ageDays, halfLifeDays) {
  if (!Number.isFinite(ageDays) || ageDays <= 0) return 1;
  if (!halfLifeDays || halfLifeDays <= 0) return 1;
  return Math.exp((-Math.log(2) * ageDays) / halfLifeDays);
}

/**
 * Read + decay a preference profile. Prefers the signed-in user profile and
 * merges the guest session profile on top so both contribute signals.
 */
async function getPreferenceVector(db, { userId, sessionId } = {}) {
  const config = await loadConfig(db);
  const halfLife = config.preference?.halfLifeDays || 30;
  const nowMs = Date.now();

  const profileSources = [];
  if (userId) profileSources.push(userId);
  if (sessionId) profileSources.push(sessionId);
  if (!profileSources.length) return buildEmptyProfile();

  const [profiles, sessions] = await Promise.all([
    Promise.all(
      profileSources.map((id) =>
        db
          .collection('userPreferences')
          .doc(id)
          .get()
          .then((snap) => (snap.exists ? snap.data() : null))
          .catch(() => null),
      ),
    ),
    Promise.all(
      profileSources.map((id) =>
        db
          .collection('sessionContext')
          .doc(id)
          .get()
          .then((snap) => (snap.exists ? snap.data() : null))
          .catch(() => null),
      ),
    ),
  ]);

  const merged = mergeProfiles(profiles.filter(Boolean), nowMs, halfLife);

  // Session-context signals (carts, purchases, clicks) enrich the profile so
  // "recently viewed", "cart-based" and purchase-aware surfaces behave well.
  for (const ctx of sessions.filter(Boolean)) {
    unionInto(merged.cartedIds, ctx.carted);
    unionInto(merged.purchasedIds, ctx.purchased);
    unionInto(merged.clickedIds, ctx.clicked);
    unionInto(merged.likedIds, ctx.liked);
    for (const s of ctx.searches || []) {
      if (s?.q && !merged.searchQueries.includes(s.q)) merged.searchQueries.push(s.q);
    }
    merged.orderCount += Number(ctx.orderCount) || 0;
    merged.totalSpent += Number(ctx.totalSpent) || 0;
    if (merged.orderCount > 0) merged.hasPreferences = true;
  }

  merged.avgOrderValue = merged.orderCount > 0 ? Math.round(merged.totalSpent / merged.orderCount) : 0;
  return merged;
}

function unionInto(target, source) {
  for (const id of source || []) if (id && !target.includes(id)) target.push(id);
}

function buildEmptyProfile() {
  return {
    hasPreferences: false,
    categoryPrefs: {},
    brandPrefs: {},
    priceBands: {},
    viewedIds: [],
    cartedIds: [],
    purchasedIds: [],
    clickedIds: [],
    likedIds: [],
    searchQueries: [],
    orderCount: 0,
    totalSpent: 0,
    avgOrderValue: 0,
  };
}

/** Merge several raw profile docs, decaying each by its own update recency. */
function mergeProfiles(docs, nowMs, halfLife) {
  const out = buildEmptyProfile();

  for (const doc of docs) {
    const ageDays = (nowMs - (doc.updatedAtMs || nowMs)) / 86_400_000;
    const d = decay(ageDays, halfLife);

    const categoryPrefs = extractNestedMap(doc, 'categoryPrefs');
    const brandPrefs = extractNestedMap(doc, 'brandPrefs');
    const priceBands = extractNestedMap(doc, 'priceBands');

    for (const [cat, w] of Object.entries(categoryPrefs)) {
      out.categoryPrefs[cat] = (out.categoryPrefs[cat] || 0) + w * d;
    }
    for (const [brand, w] of Object.entries(brandPrefs)) {
      out.brandPrefs[brand] = (out.brandPrefs[brand] || 0) + w * d;
    }
    for (const [band, w] of Object.entries(priceBands)) {
      out.priceBands[band] = (out.priceBands[band] || 0) + w * d;
    }

    const union = (arr, key) => {
      for (const id of arr || []) if (id && !out[key].includes(id)) out[key].push(id);
    };
    union(doc.views, 'viewedIds');
    union(doc.carted, 'cartedIds');
    union(doc.purchased, 'purchasedIds');
    union(doc.liked, 'likedIds');

    for (const q of doc.searchQueries || []) {
      if (q && !out.searchQueries.includes(q)) out.searchQueries.push(q);
    }

    out.orderCount += Number(doc.orderCount) || 0;
    out.totalSpent += Number(doc.totalSpent) || 0;
  }

  out.hasPreferences =
    Object.keys(out.categoryPrefs).length > 0 ||
    Object.keys(out.brandPrefs).length > 0 ||
    Object.keys(out.priceBands).length > 0 ||
    out.searchQueries.length > 0 ||
    out.orderCount > 0;

  out.avgOrderValue = out.orderCount > 0 ? Math.round(out.totalSpent / out.orderCount) : 0;
  return out;
}

/** 0..1 similarity between a product and the preference vector. */
function productPreferenceMatch(profile, product) {
  if (!profile.hasPreferences) return 0;

  const cats = product.categories || (product.category ? [product.category] : []);
  let catScore = 0;
  for (const cat of cats) {
    catScore = Math.max(catScore, profile.categoryPrefs[String(cat).toLowerCase()] || 0);
  }

  const price = Number(product.discountPrice || product.onlinePrice || product.price || 0);
  const band = priceBand(price);
  const bandScore = band ? profile.priceBands[band] || 0 : 0;

  const brand = product.brand?.name || product.brand;
  const brandScore = brand ? profile.brandPrefs[String(brand).toLowerCase()] || 0 : 0;

  const maxCat = Math.max(1, ...Object.values(profile.categoryPrefs));
  const maxBand = Math.max(1, ...Object.values(profile.priceBands));
  const maxBrand = Math.max(1, ...Object.values(profile.brandPrefs));

  const normalized = (v, m) => (m > 0 ? Math.min(1, v / m) : 0);
  return 0.5 * normalized(catScore, maxCat) + 0.3 * normalized(bandScore, maxBand) + 0.2 * normalized(brandScore, maxBrand);
}

module.exports = { getPreferenceVector, productPreferenceMatch, decay };