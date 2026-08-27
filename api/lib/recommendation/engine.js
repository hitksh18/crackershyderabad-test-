'use strict';

/* ---------------------------------------------------------------------------
   Recommendation engine.

   Orchestrates config, products, preferences, metrics, similarity and ranking
   into the storefront-facing surfaces:
     • home        – personalised feed (cold start: popularity + diversity)
     • search      – query-matched rankings (+ zero-result gap detection)
     • similar     – neighbours of a product
     • cart        – related to the items in the cart
     • recent      – recently viewed products (not yet purchased)
     • category    – within-category ranking
     • trending    – velocity-based, period-scoped
   ------------------------------------------------------------------------- */

const { loadConfig } = require('./config');
const { analyzeSearch } = require('./searchIntent');
const { getPreferenceVector } = require('./preferences');
const { loadPerformance } = require('./metrics');
const { getOrComputeNeighbours, similarityBetween } = require('./similarity');
const { scoreProduct, applyBusinessRules, diversify, withinCaps } = require('./ranking');
const { cacheKey, cacheGet, cacheSet } = require('./cache');

const DEFAULT_IMAGE = '/images/product-placeholder.webp';

function prepareProduct(raw) {
  return {
    ...raw,
    price: Number(raw.discountPrice || raw.onlinePrice || raw.price || 0),
    compareAt: Number(raw.onlinePrice || raw.price || 0),
    categories: Array.isArray(raw.categories) && raw.categories.length ? raw.categories : [raw.category || 'Uncategorized'],
  };
}

/** Load every product once per request (pool for similarity + ranking). */
async function loadAllProducts(db, config) {
  const snap = await db.collection('products').get();
  return snap.docs.map((d) => prepareProduct({ id: d.id, ...d.data() }));
}

function excludeIds(products, ids) {
  const set = new Set(ids.filter(Boolean));
  return products.filter((p) => !set.has(p.id));
}

/**
 * Core ranking pipeline shared by all surfaces.
 * `scorer` returns per-product component scores or null to skip.
 */
async function rank(db, products, { profile, config, scorer, k, similarityFn }) {
  const rules = config.rules || {};
  const limit = Math.min(k || rules.defaultLimit || 12, rules.maxLimit || 40);

  const perfMap = await loadPerformance(db, products.map((p) => p.id), config);

  const scored = [];
  for (const product of products) {
    if (applyBusinessRules(product, rules)) continue;
    const comps = scorer ? scorer(product) : {};
    if (comps === null) continue;

    const entry = scoreProduct({
      product,
      profile: profile?.hasPreferences ? profile : null,
      perf: perfMap.get(product.id),
      search: comps.search,
      anchor: comps.anchor,
      config,
    });
    scored.push({ product, score: entry.score, components: entry.components, reason: entry.reason, signals: entry.signals });
  }

  scored.sort((a, b) => b.score - a.score);

  const diversified = diversify(scored, { k: limit, lambda: Number(rules.diversificationLambda) || 0.35, similarityFn });

  // Enforce category caps after diversification (diversity already spreads).
  const counts = { categories: new Map() };
  const capped = [];
  for (const item of diversified) {
    const cats = item.product.categories || [];
    const over =
      cats.length === 0
        ? false
        : !cats.some((c) => (counts.categories.get(String(c).toLowerCase()) || 0) < (Number(rules.maxPerCategory) || 3));
    if (over) continue;
    for (const c of cats) counts.categories.set(String(c).toLowerCase(), (counts.categories.get(String(c).toLowerCase()) || 0) + 1);
    capped.push(item);
    if (capped.length >= limit) break;
  }

  return capped.map((item) => ({
    productId: item.product.id,
    name: item.product.name,
    image: item.product.imageURL || item.product.imageUrl || DEFAULT_IMAGE,
    price: item.product.price,
    compareAt: item.product.compareAt,
    discountPrice: item.product.discountPrice || null,
    categories: item.product.categories,
    score: round3(item.score),
    reason: item.reason,
    signals: item.signals,
  }));
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/** Personalised homepage feed, cold-start fallback to popularity+diversity. */
async function homeRecommendations(db, { userId, sessionId, limit } = {}) {
  const config = await loadConfig(db);
  const profile = await getPreferenceVector(db, { userId, sessionId });

  const cache = cacheKey('home', userId || sessionId, { limit });
  const cached = await cacheGet(db, cache);
  if (cached) return { fromCache: true, results: cached };

  const products = await loadAllProducts(db, config);
  const excluded = [...(profile.viewedIds || []), ...(profile.purchasedIds || [])].slice(-80);
  const pool = excludeIds(products, excluded);

  const results = await rank(db, pool, {
    profile,
    config,
    k: limit,
    similarityFn: (a, b) => similarityBetween(a, b),
  });

  await cacheSet(db, cache, results, config.rules?.cacheTtlSeconds || 300);
  return { fromCache: false, results };
}

/** Build a search-relevance scorer from the query analysis. */
function buildSearchScorer(analysis) {
  const tokens = analysis.tokens || [];
  const category = analysis.category;
  const price = analysis.price || {};

  return {
    score(product) {
      let relevance = 0;
      const haystack = `${product.name || ''} ${product.description || ''} ${(product.categories || []).join(' ')}`.toLowerCase();

      if (category) {
        const catMatch = (product.categories || []).some((c) => c.toLowerCase() === category.toLowerCase());
        if (catMatch) relevance += 0.5;
      }

      if (tokens.length) {
        let hits = 0;
        for (const token of tokens) {
          if (haystack.includes(token)) hits += 1;
        }
        relevance += 0.5 * (hits / tokens.length);
      }

      if (price.maxPrice) {
        const p = Number(product.discountPrice || product.onlinePrice || product.price || 0);
        if (p > 0 && p <= price.maxPrice) relevance += 0.15;
      }
      if (price.minPrice) {
        const p = Number(product.discountPrice || product.onlinePrice || product.price || 0);
        if (p > 0 && p >= price.minPrice) relevance += 0.15;
      }

      return Math.min(1, relevance);
    },
  };
}

/** Search-ranked recommendations. */
async function searchRecommendations(db, { q, userId, sessionId, limit } = {}) {
  const config = await loadConfig(db);
  const query = String(q || '').trim();
  if (!query) return { results: [], analysis: null };

  const analysis = analyzeSearch(query);
  const profile = await getPreferenceVector(db, { userId, sessionId });
  const products = await loadAllProducts(db, config);
  const pool = excludeIds(products, profile.purchasedIds || []);
  const scorer = buildSearchScorer(analysis);

  const results = await rank(db, pool, {
    profile: analysis.category || analysis.tokens.length ? profile : null,
    config,
    k: limit,
    scorer: (product) => ({ search: scorer }),
  });

  const relevant = results.filter((r) => r.signals.includes('searchRelevance'));
  if (!relevant.length && analysis.hasMeaningfulTerms) {
    return { results: [], empty: true, analysis };
  }
  return { results, relevantCount: relevant.length, analysis };
}

/** Similar products for a given product. */
async function similarProducts(db, { productId, limit } = {}) {
  const config = await loadConfig(db);
  const productSnap = await db.collection('products').doc(productId).get();
  if (!productSnap.exists) return { results: [], error: 'Product not found' };

  const anchor = prepareProduct({ id: productSnap.id, ...productSnap.data() });
  const products = await loadAllProducts(db, config);
  const neighbours = await getOrComputeNeighbours(db, anchor, async () => products, { k: 15 });

  const neighbourMap = new Map(neighbours.map((n) => [n.id, n.score]));
  const pool = products.filter((p) => neighbourMap.has(p.id));

  const results = await rank(db, pool, {
    config,
    k: limit,
    scorer: () => ({ anchor: { similarityMap: neighbourMap } }),
    similarityFn: (a, b) => similarityBetween(a, b),
  });

  return { results };
}

/** Cart-aware recommendations: similar + category-affinity + complements. */
async function cartRecommendations(db, { items = [], userId, sessionId, limit } = {}) {
  const config = await loadConfig(db);
  const ids = (items || []).map((i) => String(i?.id || '')).filter(Boolean).slice(0, 30);
  if (!ids.length) return homeRecommendations(db, { userId, sessionId, limit });

  const productSnaps = await Promise.all(
    ids.map((id) => db.collection('products').doc(id).get().catch(() => null)),
  );
  const anchors = productSnaps.filter((s) => s?.exists).map((s) => prepareProduct({ id: s.id, ...s.data() }));
  if (!anchors.length) return homeRecommendations(db, { userId, sessionId, limit });

  const profile = await getPreferenceVector(db, { userId, sessionId });
  const products = await loadAllProducts(db, config);
  const pool = excludeIds(products, ids);

  const similarityMap = new Map();
  for (const p of pool) {
    let best = 0;
    for (const anchor of anchors) best = Math.max(best, similarityBetween(p, anchor));
    similarityMap.set(p.id, best);
  }

  const results = await rank(db, pool, {
    profile,
    config,
    k: limit,
    scorer: (product) => ({ anchor: { similarityMap } }),
    similarityFn: (a, b) => similarityBetween(a, b),
  });

  return { results, anchors: anchors.map((a) => a.id) };
}

/** Recently viewed products (excluding carted/purchased). */
async function recentRecommendations(db, { userId, sessionId, limit } = {}) {
  const config = await loadConfig(db);
  const profile = await getPreferenceVector(db, { userId, sessionId });
  const viewed = (profile.viewedIds || []).slice().reverse();

  if (!viewed.length) return { results: [] };

  const snaps = await Promise.all(viewed.slice(0, 40).map((id) => db.collection('products').doc(id).get().catch(() => null)));
  const seen = new Set();
  const pool = snaps
    .filter((s) => s?.exists)
    .map((s) => prepareProduct({ id: s.id, ...s.data() }))
    .filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  const blocked = new Set([...(profile.purchasedIds || []), ...(profile.cartedIds || [])]);
  const filtered = pool.filter((p) => !blocked.has(p.id));

  const perfMap = await loadPerformance(db, filtered.map((p) => p.id), config);
  const results = filtered.slice(0, limit || 12).map((p) => {
    const perf = perfMap.get(p.id);
    const entry = scoreProduct({ product: p, profile: null, perf, search: null, anchor: null, config });
    return {
      productId: p.id,
      name: p.name,
      image: p.imageURL || p.imageUrl || DEFAULT_IMAGE,
      price: p.price,
      compareAt: p.compareAt,
      categories: p.categories,
      score: round3(entry.score),
      reason: 'Previously viewed',
      signals: ['recent'],
    };
  });

  return { results };
}

/** Ranked products within a single category. */
async function categoryRecommendations(db, { category, userId, sessionId, limit } = {}) {
  const config = await loadConfig(db);
  const products = await loadAllProducts(db, config);
  const pool = products.filter((p) =>
    (p.categories || []).some((c) => String(c).toLowerCase() === String(category).toLowerCase()),
  );
  if (!pool.length) return { results: [] };

  const profile = await getPreferenceVector(db, { userId, sessionId });
  const results = await rank(db, pool, { profile, config, k: limit });
  return { results };
}

/** Trending products by velocity, optionally within a category. */
async function trendingProducts(db, { category, period = '7d', limit } = {}) {
  const config = await loadConfig(db);
  const days = period === '24h' ? 1 : period === '30d' ? 30 : period === '90d' ? 90 : 7;
  const products = await loadAllProducts(db, config);
  const pool = category
    ? products.filter((p) => (p.categories || []).some((c) => String(c).toLowerCase() === String(category).toLowerCase()))
    : products;

  const perfMap = await loadPerformance(db, pool.map((p) => p.id), config);
  const { trendingScore } = require('./metrics');

  const scored = [];
  for (const p of pool) {
    if (applyBusinessRules(p, config.rules)) continue;
    const perf = perfMap.get(p.id);
    const t = trendingScore(perf);
    const s = salesScoreShort(perf);
    scored.push({ product: p, score: 0.6 * t + 0.4 * s });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, Math.min(limit || 12, config.rules?.maxLimit || 40));

  return {
    results: top.map(({ product, score }) => ({
      productId: product.id,
      name: product.name,
      image: product.imageURL || product.imageUrl || DEFAULT_IMAGE,
      price: product.price,
      compareAt: product.compareAt,
      categories: product.categories,
      score: round3(score),
      reason: 'Trending',
      signals: ['trending'],
    })),
    period,
  };
}

function salesScoreShort(perf) {
  const w = perf?.windows || {};
  const units = (w['7d']?.unitsSold || 0) + (w['24h']?.unitsSold || 0) * 0.5;
  return Math.min(1, Math.log1p(units) / Math.log1p(50));
}

module.exports = {
  homeRecommendations,
  searchRecommendations,
  similarProducts,
  cartRecommendations,
  recentRecommendations,
  categoryRecommendations,
  trendingProducts,
  buildSearchScorer,
  prepareProduct,
};