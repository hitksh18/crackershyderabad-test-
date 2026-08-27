'use strict';

/* ---------------------------------------------------------------------------
   Recommendation result cache.

   Firestore-backed TTL cache. Keys encode the recommendation surface plus the
   profile id and the request parameters so different users/params never
   collide. Events DO NOT invalidate the cache — the TTL is deliberately short
   (config rules.cacheTtlSeconds) so personalisation stays reasonably fresh
   without an invalidation protocol.
   ------------------------------------------------------------------------- */

function cacheKey(surface, profileId, params = {}) {
  const sorted = Object.entries(params)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join('&');
  return `${surface}:${profileId || 'anon'}:${sorted}`;
}

async function cacheGet(db, key) {
  try {
    const snap = await db.collection('recommendationCache').doc(key).get();
    if (!snap.exists) return null;
    const data = snap.data();
    if (Date.now() > (data.expiresAtMs || 0)) return null;
    return data.results || null;
  } catch {
    return null;
  }
}

async function cacheSet(db, key, results, ttlSeconds = 300) {
  try {
    await db.collection('recommendationCache').doc(key).set(
      {
        key,
        results,
        createdAtMs: Date.now(),
        expiresAtMs: Date.now() + ttlSeconds * 1000,
      },
      { merge: true },
    );
  } catch (error) {
    console.warn('[rec] cache write failed:', error.message);
  }
}

module.exports = { cacheKey, cacheGet, cacheSet };