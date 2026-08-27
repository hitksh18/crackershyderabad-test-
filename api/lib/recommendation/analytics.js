'use strict';

/* ---------------------------------------------------------------------------
   Admin analytics.

   Aggregates for the admin dashboard:
     • top searches & zero-result searches (merchandising gaps)
     • top products by views / clicks / likes / carts / purchases
     • trending products (velocity)
     • funnel & conversion stats
     • search-to-purchase attribution
     • recommendation-surface performance (impressions → clicks → carts)
   Also records recommendation impression/click events from the storefront.
   ------------------------------------------------------------------------- */

const { Timestamp } = require('firebase-admin/firestore');
const { loadConfig } = require('./config');
const { derivePerformance } = require('./metrics');
const { trendingProducts } = require('./engine');

const REC_SURFACES = new Set(['home', 'search', 'similar', 'cart', 'recent', 'category', 'trending', 'billing']);
const REC_EVENT_TYPES = new Set(['impression', 'click', 'add_to_cart', 'purchase']);

function normalizeRecEvent(body) {
  const type = String(body?.type || '').toLowerCase();
  const surface = String(body?.surface || '').toLowerCase();
  if (!REC_EVENT_TYPES.has(type)) return { error: `Unsupported recommendation event: ${type}` };
  if (!REC_SURFACES.has(surface)) return { error: `Unsupported surface: ${surface}` };
  const productId = String(body?.productId || '').slice(0, 128);
  if (!productId) return { error: 'productId is required' };

  return {
    value: {
      type,
      surface,
      productId,
      position: Math.max(0, Number(body?.position) || 0),
      sessionId: String(body?.sessionId || '').slice(0, 128) || null,
      userId: String(body?.userId || '').slice(0, 128) || null,
      source: String(body?.source || 'recommendation').slice(0, 40),
      ts: Timestamp.now(),
    },
  };
}

/** Record one impression/click/purchase on a recommendation surface. */
async function recordRecommendationEvent(db, body) {
  const { value, error } = normalizeRecEvent(body);
  if (error) return { error };
  const ref = db.collection('recommendationEvents');
  await ref.add(value);
  return { ok: true };
}

async function loadAll(db) {
  const [products, metrics, keywords, zeros] = await Promise.all([
    db.collection('products').get(),
    db.collection('productMetrics').get(),
    db.collection('searchKeywordStats').get(),
    db.collection('zeroResultAggregates').get(),
  ]);

  const productNames = new Map();
  for (const d of products.docs) productNames.set(d.id, d.data().name || d.id);

  const metricsList = metrics.docs.map((d) => ({ id: d.id, ...d.data() }));
  const keywordList = keywords.docs.map((d) => ({ id: d.id, ...d.data() }));
  const zeroList = zeros.docs.map((d) => ({ id: d.id, ...d.data() }));
  return { productNames, metricsList, keywordList, zeroList };
}

function topByField(metricsList, field, productNames, n) {
  return metricsList
    .filter((m) => Number(m[field]) > 0)
    .sort((a, b) => Number(b[field]) - Number(a[field]))
    .slice(0, n)
    .map((m) => ({
      productId: m.id,
      name: productNames.get(m.id) || m.id,
      value: Number(m[field]),
    }));
}

/**
 * Full analytics snapshot.
 * options: { days } – window for search stats and trends (default 30).
 */
async function analyticsSnapshot(db, { days = 30 } = {}) {
  const config = await loadConfig(db);
  const { productNames, metricsList, keywordList, zeroList } = await loadAll(db);

  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const perfList = metricsList.map((m) => ({ id: m.id, perf: derivePerformance(m, config) }));
  const perfMap = new Map(perfList.map((p) => [p.id, p.perf]));

  const trending = perfList
    .map(({ id, perf }) => ({
      productId: id,
      name: productNames.get(id) || id,
      trendScore: Math.round(require('./metrics').trendingScore(perf) * 1000) / 1000,
      unitsSold: perf.windows['7d']?.unitsSold || 0,
    }))
    .filter((t) => t.trendScore > 0 || t.unitsSold > 0)
    .sort((a, b) => b.trendScore - a.trendScore)
    .slice(0, 20);

  const searches = keywordList
    .filter((k) => k.lastSearchedAt && String(k.lastSearchedAt.toDate ? k.lastSearchedAt.toDate().toISOString() : '').slice(0, 10) >= cutoff)
    .sort((a, b) => Number(b.count) - Number(a.count));

  const zeroSearches = zeroList
    .filter((z) => z.lastSearchedAt && String(z.lastSearchedAt.toDate ? z.lastSearchedAt.toDate().toISOString() : '').slice(0, 10) >= cutoff)
    .sort((a, b) => Number(b.count) - Number(a.count));

  const totals = perfList.reduce(
    (acc, { perf }) => {
      const l = perf.lifetime;
      acc.views += l.views;
      acc.clicks += l.clicks;
      acc.likes += l.likes;
      acc.addToCart += l.addToCart;
      acc.purchases += l.purchases;
      acc.unitsSold += l.unitsSold;
      acc.revenue += l.revenue;
      acc.checkoutStarts += l.checkoutStarts;
      return acc;
    },
    { views: 0, clicks: 0, likes: 0, addToCart: 0, purchases: 0, unitsSold: 0, revenue: 0, checkoutStarts: 0 },
  );

  const searchTotals = searches.reduce(
    (acc, k) => {
      acc.searches += Number(k.count) || 0;
      acc.cartConversions += Number(k.cartConversions) || 0;
      acc.purchaseConversions += Number(k.purchaseConversions) || 0;
      return acc;
    },
    { searches: 0, cartConversions: 0, purchaseConversions: 0 },
  );

  // Recommendation-surface performance (CTR funnel) from recommendationEvents.
  const recSnap = await db.collection('recommendationEvents').get();
  const recAgg = { impressions: 0, clicks: 0, addToCart: 0, purchases: 0, bySurface: {} };
  for (const d of recSnap.docs) {
    const e = d.data();
    const key = `${e.type}:${e.surface}`;
    recAgg.bySurface[key] = (recAgg.bySurface[key] || 0) + 1;
    if (e.type === 'impression') recAgg.impressions += 1;
    if (e.type === 'click') recAgg.clicks += 1;
    if (e.type === 'add_to_cart') recAgg.addToCart += 1;
    if (e.type === 'purchase') recAgg.purchases += 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    products: {
      total: productNames.size,
      topViewed: topByField(metricsList, 'views', productNames, 10),
      topClicked: topByField(metricsList, 'clicks', productNames, 10),
      topLiked: topByField(metricsList, 'likes', productNames, 10),
      topCarted: topByField(metricsList, 'addToCart', productNames, 10),
      topPurchased: topByField(metricsList, 'purchases', productNames, 10),
      topRevenue: metricsList
        .filter((m) => Number(m.revenue) > 0)
        .sort((a, b) => Number(b.revenue) - Number(a.revenue))
        .slice(0, 10)
        .map((m) => ({ productId: m.id, name: productNames.get(m.id) || m.id, value: Number(m.revenue) })),
      trending,
    },
    funnel: totals,
    funnelDerived: {
      viewToCart: totals.views > 0 ? round(totals.addToCart / totals.views) : 0,
      viewToPurchase: totals.views > 0 ? round(totals.purchases / totals.views) : 0,
      cartToPurchase: totals.addToCart > 0 ? round(totals.purchases / totals.addToCart) : 0,
      avgOrderValue: totals.purchases > 0 ? round(totals.revenue / totals.purchases) : 0,
    },
    search: {
      total: searchTotals.searches,
      topSearches: searches.slice(0, 20).map((k) => ({
        query: k.query || k.id,
        count: Number(k.count),
        cartConversions: Number(k.cartConversions) || 0,
        purchaseConversions: Number(k.purchaseConversions) || 0,
        conversionRate: Number(k.count) > 0 ? round((Number(k.purchaseConversions) || 0) / Number(k.count)) : 0,
        categoryIntent: k.categoryIntent || null,
      })),
      zeroResult: zeroSearches.slice(0, 20).map((z) => ({
        query: z.query || z.id,
        count: Number(z.count),
        categoryIntent: z.categoryIntent || null,
      })),
      searchToCartRate: searchTotals.searches > 0 ? round(searchTotals.cartConversions / searchTotals.searches) : 0,
      searchToPurchaseRate: searchTotals.searches > 0 ? round(searchTotals.purchaseConversions / searchTotals.searches) : 0,
    },
    recommendations: {
      impressions: recAgg.impressions,
      clicks: recAgg.clicks,
      addToCart: recAgg.addToCart,
      purchases: recAgg.purchases,
      ctr: recAgg.impressions > 0 ? round(recAgg.clicks / recAgg.impressions) : 0,
      addToCartRate: recAgg.impressions > 0 ? round(recAgg.addToCart / recAgg.impressions) : 0,
      purchaseRate: recAgg.impressions > 0 ? round(recAgg.purchases / recAgg.impressions) : 0,
      bySurface: recAgg.bySurface,
    },
  };
}

function round(n) {
  return Math.round(n * 10000) / 10000;
}

module.exports = { analyticsSnapshot, recordRecommendationEvent, normalizeRecEvent, REC_SURFACES };