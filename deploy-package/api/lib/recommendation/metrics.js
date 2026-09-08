'use strict';

/* ---------------------------------------------------------------------------
   Product analytics.

   Reads productMetrics documents (lifetime + per-day counters) and derives:
     • sales performance across windows (24h / 7d / 30d / 90d)
     • trending score (growth of this period vs the previous period)
     • conversion rates (cart/view, purchase/view)
   ------------------------------------------------------------------------- */

const { loadConfig } = require('./config');
const { dayKey } = require('./events');
const { extractNestedMap } = require('./nested');

function daysAgoKey(days) {
  const d = new Date(Date.now() - days * 86_400_000);
  return dayKey(d);
}

/** Sum a field across the per-day map for the last `days` days. */
function sumWindow(daysMap, field, days) {
  if (!daysMap) return 0;
  const from = daysAgoKey(days);
  let total = 0;
  for (const [day, counts] of Object.entries(daysMap)) {
    if (day >= from && counts && Number.isFinite(counts[field])) total += counts[field];
  }
  return total;
}

/** Derive the full performance profile of one product from its metrics doc. */
function derivePerformance(metrics, config) {
  const m = metrics || {};
  const days = extractNestedMap(m, 'days');

  const windows = {};
  for (const [label, weight] of Object.entries(config.salesWindows || {})) {
    const daysNum = label === '24h' ? 1 : Number(label.replace('d', ''));
    windows[label] = {
      unitsSold: sumWindow(days, 'unitsSold', daysNum),
      revenue: sumWindow(days, 'revenue', daysNum),
      views: sumWindow(days, 'views', daysNum),
      addToCart: sumWindow(days, 'addToCart', daysNum),
    };
  }

  const w7 = windows['7d'];
  const w7Prev = {
    unitsSold: sumWindow(days, 'unitsSold', 14) - w7.unitsSold,
    views: sumWindow(days, 'views', 14) - w7.views,
    addToCart: sumWindow(days, 'addToCart', 14) - w7.addToCart,
  };

  const totalViews = Math.max(0, Number(m.views) || 0);
  const totalCarts = Math.max(0, Number(m.addToCart) || 0);
  const totalPurchases = Math.max(0, Number(m.purchases) || 0);

  return {
    lifetime: {
      views: totalViews,
      clicks: Number(m.clicks) || 0,
      likes: Number(m.likes) || 0,
      addToCart: totalCarts,
      purchases: totalPurchases,
      unitsSold: Number(m.unitsSold) || 0,
      revenue: Number(m.revenue) || 0,
      checkoutStarts: Number(m.checkoutStarts) || 0,
      shares: Number(m.shares) || 0,
    },
    windows,
    trend: {
      unitsGrowth: growth(w7.unitsSold, w7Prev.unitsSold),
      viewsGrowth: growth(w7.views, w7Prev.views),
      cartGrowth: growth(w7.addToCart, w7Prev.addToCart),
    },
    conversion: {
      viewToCart: totalViews > 0 ? Math.min(1, totalCarts / totalViews) : 0,
      viewToPurchase: totalViews > 0 ? Math.min(1, totalPurchases / totalViews) : 0,
      cartToPurchase: totalCarts > 0 ? Math.min(1, totalPurchases / totalCarts) : 0,
    },
  };
}

function growth(current, previous) {
  if (previous <= 0) return current > 0 ? 1 : 0;
  return Math.max(-1, Math.min(1, (current - previous) / previous));
}

/** Normalised (0..1) trending score from the growth deltas. */
function trendingScore(perf) {
  const t = perf.trend || {};
  const g = Math.max(0, t.unitsGrowth || 0) * 0.5 + Math.max(0, t.viewsGrowth || 0) * 0.3 + Math.max(0, t.cartGrowth || 0) * 0.2;
  return Math.min(1, g);
}

/** Normalised (0..1) sales score across weighted windows. */
function salesScore(perf) {
  const windows = perf.windows || {};
  const weights = { '24h': 0.4, '7d': 0.3, '30d': 0.2, '90d': 0.1 };
  let score = 0;
  for (const [label, w] of Object.entries(weights)) {
    const win = windows[label];
    if (!win) continue;
    const units = Math.log1p(win.unitsSold || 0) / Math.log1p(200);
    const revenue = Math.log1p(win.revenue || 0) / Math.log1p(50000);
    score += w * Math.min(1, Math.max(0, 0.6 * units + 0.4 * revenue));
  }
  return Math.min(1, score);
}

/** Normalised (0..1) conversion score from view→cart→purchase funnel. */
function conversionScore(perf) {
  const c = perf.conversion || {};
  return 0.5 * (c.viewToCart || 0) + 0.3 * (c.viewToPurchase || 0) + 0.2 * (c.cartToPurchase || 0);
}

/**
 * Batch-load performance for many product ids in parallel.
 * Returns Map<productId, perf>.
 */
async function loadPerformance(db, productIds, config) {
  const results = new Map();
  if (!productIds.length) return results;

  const chunks = [];
  for (let i = 0; i < productIds.length; i += 400) chunks.push(productIds.slice(i, i + 400));

  for (const chunk of chunks) {
    const snaps = await Promise.all(
      chunk.map((id) => db.collection('productMetrics').doc(id).get().catch(() => null)),
    );
    snaps.forEach((snap, i) => {
      results.set(chunk[i], derivePerformance(snap?.exists ? snap.data() : null, config));
    });
  }
  return results;
}

module.exports = {
  derivePerformance,
  trendingScore,
  salesScore,
  conversionScore,
  loadPerformance,
  sumWindow,
  growth,
};