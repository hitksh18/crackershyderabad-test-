'use strict';

/* ---------------------------------------------------------------------------
   Recommendation engine configuration.

   Everything tunable lives here and in the `recConfig/main` Firestore
   document (admin-editable via the API). Weights must never be hardcoded in
   the scoring services.
   ------------------------------------------------------------------------- */

const DEFAULT_CONFIG = {
  version: 1,

  /* Behaviour weight per event type (relative importance of a single event). */
  behaviorWeights: {
    SEARCH: 3,
    PRODUCT_VIEW: 1,
    PRODUCT_CLICK: 2,
    CATEGORY_VIEW: 2,
    PRODUCT_LIKE: 5,
    ADD_TO_CART: 7,
    REMOVE_FROM_CART: -3,
    CHECKOUT_START: 9,
    PURCHASE: 12,
    PURCHASE_COMPLETE: 12,
    PRODUCT_SHARE: 4,
  },

  /* Recommendation score = Σ weight × component (all components 0..1). */
  scoringWeights: {
    userPreference: 0.25,
    searchRelevance: 0.35,
    similarity: 0.15,
    sales: 0.1,
    trending: 0.05,
    conversion: 0.05,
    freshness: 0.05,
  },

  /* Preference profile learning. */
  preference: {
    halfLifeDays: 30, // exponential decay: 50% influence after this many days
    maxViewHistory: 60,
    maxCartHistory: 30,
    maxPurchaseHistory: 30,
    maxSearchHistory: 12,
  },

  /* Business rules, applied AFTER relevance scoring. */
  rules: {
    excludeOutOfStock: true,
    excludeDiscontinued: true,
    boostFeatured: 1.1, // multiplier
    boostDiscounted: 1.05, // multiplier on products with an active discount
    maxPerCategory: 3,
    maxPerPriceBand: 4,
    diversificationLambda: 0.35, // MMR lambda: 0 = pure relevance, 1 = pure diversity
    cacheTtlSeconds: 300,
    defaultLimit: 12,
    maxLimit: 40,
  },

  /* Sales window weights for the sales-performance component. */
  salesWindows: {
    '24h': 0.4,
    '7d': 0.3,
    '30d': 0.2,
    '90d': 0.1,
  },

  /* Trending: growth comparison window (this period vs previous period). */
  trending: {
    compareDays: 7,
  },
};

const CONFIG_DOC = 'recConfig/main';

/**
 * Load the effective configuration, merging stored overrides over the
 * defaults so a partial document never breaks the engine.
 */
async function loadConfig(db) {
  try {
    const snap = await db.collection('recConfig').doc('main').get();
    if (!snap.exists) return DEFAULT_CONFIG;
    return deepMerge(DEFAULT_CONFIG, snap.data());
  } catch (error) {
    console.error('[rec] failed to load config, using defaults:', error.message);
    return DEFAULT_CONFIG;
  }
}

function deepMerge(base, override) {
  const out = { ...base };
  for (const key of Object.keys(override || {})) {
    const b = base[key];
    const o = override[key];
    if (b && o && typeof b === 'object' && !Array.isArray(b) && typeof o === 'object' && !Array.isArray(o)) {
      out[key] = deepMerge(b, o);
    } else if (o !== undefined) {
      out[key] = o;
    }
  }
  return out;
}

async function saveConfig(db, patch) {
  const current = await loadConfig(db);
  const next = deepMerge(current, patch || {});
  await db.collection('recConfig').doc('main').set({
    ...next,
    updatedAt: new Date().toISOString(),
  });
  return next;
}

module.exports = { DEFAULT_CONFIG, loadConfig, saveConfig, deepMerge };