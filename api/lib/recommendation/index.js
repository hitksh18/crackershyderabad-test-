'use strict';

/* ---------------------------------------------------------------------------
   Recommendation API facade.

   Thin, defensive request handlers used by api/server.js. Every handler:
     • reads query params with sane defaults,
     • caps limits by config,
     • never throws — returns { error } instead (server maps to HTTP codes).
   ------------------------------------------------------------------------- */

const { loadConfig, saveConfig } = require('./config');
const {
  homeRecommendations,
  searchRecommendations,
  similarProducts,
  cartRecommendations,
  recentRecommendations,
  categoryRecommendations,
  trendingProducts,
} = require('./engine');
const { recordEvent } = require('./events');
const { analyticsSnapshot, recordRecommendationEvent } = require('./analytics');

const MAX_SESSION = 128;

function profileOf(req) {
  return {
    userId: String(req.body?.userId || req.query?.userId || '').slice(0, MAX_SESSION) || null,
    sessionId: String(req.body?.sessionId || req.query?.sessionId || '').slice(0, MAX_SESSION) || null,
  };
}

async function safe(handler, req, res) {
  try {
    const result = await handler();
    if (result && result.error) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error('[rec] handler failed:', error.message);
    return res.status(500).json({ error: 'Recommendation service error' });
  }
}

const limitOf = (req, fallback) => {
  const n = Number(req.query.limit);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 40) : fallback;
};

function handleRecordEvent(req, res) {
  // req.caller is the verified token (or null for guests); the client-supplied
  // body.userId is never trusted for attribution — see events.validateEvent.
  return safe(
    () => recordEvent(req.firestore, req.body, { authUid: req.caller?.uid || null, req }),
    req,
    res,
  );
}

function handleHome(req, res) {
  return safe(
    () => homeRecommendations(req.firestore, { ...profileOf(req), limit: limitOf(req, 12) }),
    req,
    res,
  );
}

function handleSearch(req, res) {
  return safe(
    () =>
      searchRecommendations(req.firestore, {
        q: String(req.query.q || '').slice(0, 200),
        ...profileOf(req),
        limit: limitOf(req, 12),
      }),
    req,
    res,
  );
}

function handleSimilar(req, res) {
  return safe(
    () => similarProducts(req.firestore, { productId: String(req.params.productId || ''), limit: limitOf(req, 10) }),
    req,
    res,
  );
}

function handleCart(req, res) {
  return safe(
    () =>
      cartRecommendations(req.firestore, {
        items: Array.isArray(req.body?.items) ? req.body.items : [],
        ...profileOf(req),
        limit: limitOf(req, 12),
      }),
    req,
    res,
  );
}

function handleRecent(req, res) {
  return safe(
    () => recentRecommendations(req.firestore, { ...profileOf(req), limit: limitOf(req, 12) }),
    req,
    res,
  );
}

function handleCategory(req, res) {
  return safe(
    () =>
      categoryRecommendations(req.firestore, {
        category: String(req.query.category || req.params.category || ''),
        ...profileOf(req),
        limit: limitOf(req, 12),
      }),
    req,
    res,
  );
}

function handleTrending(req, res) {
  return safe(
    () =>
      trendingProducts(req.firestore, {
        category: String(req.query.category || '') || null,
        period: String(req.query.period || '7d'),
        limit: limitOf(req, 12),
      }),
    req,
    res,
  );
}

function handleRecEvent(req, res) {
  return safe(() => recordRecommendationEvent(req.firestore, req.body), req, res);
}

function handleAnalytics(req, res) {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  return safe(() => analyticsSnapshot(req.firestore, { days }), req, res);
}

function handleGetConfig(req, res) {
  return safe(() => loadConfig(req.firestore), req, res);
}

function handlePutConfig(req, res) {
  const patch = req.body && typeof req.body === 'object' ? req.body : {};
  return safe(() => saveConfig(req.firestore, patch), req, res);
}

module.exports = {
  handleRecordEvent,
  handleHome,
  handleSearch,
  handleSimilar,
  handleCart,
  handleRecent,
  handleCategory,
  handleTrending,
  handleRecEvent,
  handleAnalytics,
  handleGetConfig,
  handlePutConfig,
};