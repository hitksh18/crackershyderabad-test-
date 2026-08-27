'use strict';

/* ---------------------------------------------------------------------------
   Ranking.

   Combines the component scores into a single weighted recommendation score
   (weights from recConfig), applies business rules (stock, category caps,
   boosts) and diversifies the final list with Maximal Marginal Relevance.
   ------------------------------------------------------------------------- */

const { productPreferenceMatch } = require('./preferences');

/**
 * Compute the weighted score for one product.
 * Components (all normalised 0..1) are scaled by config.scoringWeights.
 * Returns { score, components, reason, signals }.
 */
function scoreProduct({ product, profile, perf, search, anchor, config }) {
  const weights = config.scoringWeights || {};
  const rules = config.rules || {};

  const components = {
    userPreference: profile ? productPreferenceMatch(profile, product) : 0,
    searchRelevance: search ? search.score(product) : 0,
    similarity: anchor ? anchor.similarityMap.get(product.id) || 0 : 0,
    sales: perf ? require('./metrics').salesScore(perf) : 0,
    trending: perf ? require('./metrics').trendingScore(perf) : 0,
    conversion: perf ? require('./metrics').conversionScore(perf) : 0,
    freshness: freshnessScore(product),
  };

  let score = 0;
  for (const [name, w] of Object.entries(weights)) {
    score += (Number(w) || 0) * (components[name] || 0);
  }

  if (rules.boostFeatured && product.isFeatured) score *= Number(rules.boostFeatured) || 1;
  const price = Number(product.discountPrice || product.onlinePrice || product.price || 0);
  if (rules.boostDiscounted && product.discountPrice && product.discountPrice < (product.onlinePrice || product.price || Infinity)) {
    score *= Number(rules.boostDiscounted) || 1;
  }

  return { score, components, reason: explain(components), signals: dominantSignals(components) };
}

/** Newer products (by createdAt/sortOrder) get a small freshness boost. */
function freshnessScore(product) {
  let score = 0.15;
  const created = product.createdAt ? new Date(product.createdAt).getTime() : 0;
  if (created && Number.isFinite(created)) {
    const ageDays = (Date.now() - created) / 86_400_000;
    if (ageDays >= 0 && ageDays < 30) score = Math.max(score, 1 - ageDays / 30);
  }
  if (Number.isFinite(product.sortOrder)) score = Math.max(score, 0.35);
  return Math.min(1, score);
}

function explain(components) {
  const ranked = Object.entries(components).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top || top[1] <= 0) return 'Popular right now';

  switch (top[0]) {
    case 'userPreference':
      return 'Based on your recent activity';
    case 'searchRelevance':
      return 'Matches your search';
    case 'similarity':
      return 'Similar to items you viewed';
    case 'sales':
      return 'Top seller';
    case 'trending':
      return 'Trending this week';
    case 'conversion':
      return 'Frequently bought';
    default:
      return 'Popular right now';
  }
}

function dominantSignals(components) {
  return Object.entries(components)
    .filter(([, v]) => v > 0.2)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

/** Business rules: stock, discontinued, caps. Returns reasons for removal. */
function applyBusinessRules(product, rules) {
  if (rules.excludeOutOfStock && product.outOfStock === true) return 'out of stock';
  if (rules.excludeOutOfStock && Number.isFinite(product.stock) && product.stock <= 0) return 'out of stock';
  if (rules.excludeDiscontinued && product.discontinued === true) return 'discontinued';
  return null;
}

/** Check per-category and per-price-band caps on the result list. */
function withinCaps(product, counts, rules) {
  const cats = product.categories || (product.category ? [product.category] : []);
  for (const cat of cats) {
    if ((counts.categories.get(String(cat).toLowerCase()) || 0) >= Number(rules.maxPerCategory) || 0) return false;
  }
  return true;
}

/**
 * Greedy MMR diversification over already-scored candidates.
 * lambda=0 → pure relevance, 1 → pure diversity.
 */
function diversify(scored, { k, lambda = 0.35, similarityFn }) {
  const selected = [];
  const pool = [...scored];
  const seen = new Set();

  while (selected.length < k && pool.length) {
    let bestIdx = -1;
    let bestValue = -Infinity;

    for (let i = 0; i < pool.length; i++) {
      const item = pool[i];
      if (seen.has(item.product.id)) continue;

      let maxSim = 0;
      for (const s of selected) {
        maxSim = Math.max(maxSim, similarityFn ? similarityFn(item.product, s.product) : 0);
      }
      const value = (1 - lambda) * item.score - lambda * maxSim;
      if (value > bestValue) {
        bestValue = value;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;
    const pick = pool[bestIdx];
    seen.add(pick.product.id);
    selected.push(pick);
    pool.splice(bestIdx, 1);
  }

  return selected;
}

module.exports = { scoreProduct, applyBusinessRules, withinCaps, diversify, freshnessScore };