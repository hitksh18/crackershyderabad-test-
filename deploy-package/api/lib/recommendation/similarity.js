'use strict';

/* ---------------------------------------------------------------------------
   Content-based product similarity.

   Two products are similar when they share categories, brand, price band and
   overlapping name/description tokens. Scores are normalised 0..1 and the
   top-K neighbours are persisted to productSimilarity/{productId} so the
   engine never recomputes them per request.
   ------------------------------------------------------------------------- */

const { priceBand } = require('./events');

const SIMILARITY_WEIGHTS = {
  category: 0.45,
  name: 0.25,
  brand: 0.15,
  price: 0.15,
};

function tokenize(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function categoryOverlap(a, b) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b.map((c) => String(c).toLowerCase()));
  const hits = a.filter((c) => setB.has(String(c).toLowerCase())).length;
  return hits / Math.max(a.length, b.length);
}

/** Similarity between two product docs, 0..1. */
function similarityBetween(a, b) {
  const aCats = a.categories || (a.category ? [a.category] : []);
  const bCats = b.categories || (b.category ? [b.category] : []);

  const cat = categoryOverlap(aCats, bCats);
  const name = jaccard(tokenize(a.name), tokenize(b.name));
  const brandA = String(a.brand?.name || a.brand || '').toLowerCase();
  const brandB = String(b.brand?.name || b.brand || '').toLowerCase();
  const brand = brandA && brandB === brandA ? 1 : 0;

  const priceA = Number(a.discountPrice || a.onlinePrice || a.price || 0);
  const priceB = Number(b.discountPrice || b.onlinePrice || b.price || 0);
  const price =
    priceA > 0 && priceB > 0
      ? priceBand(priceA) === priceBand(priceB)
        ? 1
        : Math.max(0, 1 - Math.abs(priceA - priceB) / 4000)
      : 0;

  return (
    SIMILARITY_WEIGHTS.category * cat +
    SIMILARITY_WEIGHTS.name * name +
    SIMILARITY_WEIGHTS.brand * brand +
    SIMILARITY_WEIGHTS.price * price
  );
}

/**
 * Compute the top-K neighbours of a product against a candidate pool.
 * Returns [{ id, score }] sorted desc, score > threshold.
 */
function computeNeighbours(product, pool, { k = 10, threshold = 0.08 } = {}) {
  const scored = [];
  for (const candidate of pool) {
    if (candidate.id === product.id) continue;
    const score = similarityBetween(product, candidate);
    if (score >= threshold) scored.push({ id: candidate.id, score });
  }
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, k);
}

/**
 * Get cached neighbours, or compute + persist them lazily.
 * `loadAllProducts` supplies the candidate pool when a cache miss occurs.
 */
async function getOrComputeNeighbours(db, product, loadAllProducts, { k = 10 } = {}) {
  const ref = db.collection('productSimilarity').doc(product.id);
  try {
    const snap = await ref.get();
    if (snap.exists) {
      const data = snap.data();
      if (data?.similar?.length && Date.now() - (data.updatedAtMs || 0) < 7 * 86_400_000) {
        return data.similar;
      }
    }
  } catch {
    /* fall through to recompute */
  }

  const pool = await loadAllProducts();
  const similar = computeNeighbours(product, pool, { k });
  await ref
    .set({ id: product.id, similar, updatedAtMs: Date.now() }, { merge: true })
    .catch((error) => console.warn('[rec] similarity persist failed:', error.message));
  return similar;
}

module.exports = { similarityBetween, computeNeighbours, getOrComputeNeighbours, tokenize, jaccard };