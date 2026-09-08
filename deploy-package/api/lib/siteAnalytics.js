'use strict';

/* ---------------------------------------------------------------------------
   First-party site analytics.

   Two write paths and two read paths:

     recordPageview      – one SPA navigation, fanned into siteMetrics/{day}
     recordFunnelStage   – an explicit funnel step the URL cannot imply
     liveVisitors        – sessions seen in the last five minutes
     siteSnapshot        – everything the admin dashboard renders, in one read

   Storage shape — siteMetrics/{YYYY-MM-DD}:
     pageviews   number
     sessions    number                 (first hit of a session only)
     pages       { [path]: count }
     referrers   { [host]: count }              once per session
     countries   { [ISO-3166 alpha-2]: count }  once per session
     regions     { [country~region]: count }    once per session
     cities      { [country~city]: count }      once per session
     devices     { mobile|desktop|tablet: count }
     hours       { '0'..'23': count }   visitor-local hour
     grid        { 'dow-hour': count }  visitor-local, drives the 24x7 heatmap
     funnel      { productViews, addToCart, checkoutStarts: count }

   plus siteSessions/{day}_{sessionId}, a marker whose creation is what proves a
   session is new. See claimSession.

   Privacy: no IP address is ever written. One is read, once per session, and
   handed to lib/geo to resolve a country / state / city — the derived place
   names are all that is stored, and the address itself is never persisted. Edge
   headers are preferred where an edge actually sets them (see TRUST_EDGE_GEO);
   the visitor's own locale and timezone are the last resort.

   `purchases` is deliberately absent from the stored funnel — it is read from
   `orders`, the only record a client cannot inflate by replaying an event.

   Every read is bounded. Day documents are fetched by explicit id through
   getAll, never queried, so cost tracks the requested range and not how long
   the shop has been collecting. The orders query is range-scoped and capped.
   --------------------------------------------------------------------------- */

const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getClientIp, lookupGeo } = require('./geo');

/* Day boundaries are cut in the shop's timezone, not UTC. A shopkeeper asking
   for "today" means their day; a UTC key would roll over at 05:30 local and
   split one trading evening across two rows. This deliberately differs from
   the UTC dayKey() in lib/recommendation/events.js, which feeds a model rather
   than a human reading a dashboard. */
const TZ_OFFSET_MINUTES = Number(process.env.ANALYTICS_TZ_OFFSET_MINUTES || 330);

const MAX_DAYS = 92;
const GETALL_CHUNK = 100;
const ORDERS_CAP = 5000;

const LIVE_COLLECTION = 'siteLive';
const LIVE_DOC = 'current';
const LIVE_WINDOW_MS = 5 * 60 * 1000;
const LIVE_MAX_SESSIONS = 500;

const DEVICES = ['mobile', 'tablet', 'desktop'];

/* Only the step no URL implies. Product views and reaching checkout are derived
   from the pageview path in pageviewPatch, so accepting them here as well would
   count both of them twice and draw a funnel that widens in the middle. */
const FUNNEL_STAGES = ['addToCart'];

/* Region and city keys carry their country so the dashboard's country filter
   has something real to filter on. ISO 3166 reserves ZZ for "unknown", which
   is exactly what a visitor with no geo header and no locale region is. */
const GEO_SEPARATOR = '~';
const UNKNOWN_COUNTRY = 'ZZ';

/* Statuses representing money the shop did not keep. Revenue and the purchase
   step of the funnel both exclude them. */
const VOID_STATUSES = new Set(['Cancelled', 'Refunded', 'Failed']);

/* ------------------------------- day keys -------------------------------- */

function dayKeyFor(ms) {
  const shifted = new Date(ms + TZ_OFFSET_MINUTES * 60_000);
  const p = (n) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())}`;
}

/** Midnight (shop-local) of a YYYY-MM-DD key, as epoch ms. */
function dayStartMs(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - TZ_OFFSET_MINUTES * 60_000;
}

function isDayKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/* Day arithmetic lands on midday, not midnight. Stepping from midnight would
   sit exactly on a boundary, so any future change to the offset could round
   back onto the same key; from noon there is half a day of slack either way. */
function shiftDayKey(key, deltaDays) {
  return dayKeyFor(dayStartMs(key) + deltaDays * 86_400_000 + 43_200_000);
}

/** Inclusive day count, so a single day spans 1. */
function daysBetween(startKey, endKey) {
  return Math.round((dayStartMs(endKey) - dayStartMs(startKey)) / 86_400_000) + 1;
}

/** Inclusive list of day keys from `startKey` to `endKey`, oldest first. */
function dayKeyRange(startKey, endKey) {
  const span = Math.min(MAX_DAYS, Math.max(0, daysBetween(startKey, endKey)));
  const keys = [];
  for (let i = 0; i < span; i += 1) keys.push(shiftDayKey(startKey, i));
  return keys;
}

/* ------------------------------ sanitizers ------------------------------- */

/* Map keys here are supplied by whoever calls the endpoint, so they are
   cleaned before they become Firestore field names. Control characters go
   (they break the wire format) and `__reserved__` names go (Firestore rejects
   them). Spaces, dots and hyphens stay: these are nested object keys, which
   the SDK treats literally rather than as dotted field paths, so "New Delhi"
   and "google.com" are both safe to store and both worth keeping legible. */
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

function safeKey(value, max = 120) {
  const cleaned = String(value ?? '')
    .replace(CONTROL_CHARS, '')
    .trim()
    .slice(0, max);
  if (!cleaned || /^__.*__$/.test(cleaned)) return null;
  return cleaned;
}

/** Keep the path, drop the query string and any fragment. */
function normalizePath(value) {
  const raw = String(value ?? '/').split('?')[0].split('#')[0] || '/';
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const trimmed = withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : '/';
  return safeKey(trimmed, 160) || '/';
}

/* ---------------------- write-side key cardinality ----------------------- */

/* Ingestion is public, and every distinct path, referrer, region and city
   becomes a field name inside a single document per day. Without a ceiling an
   anonymous caller could post a few thousand invented paths and push that day
   past Firestore's 1 MiB document limit — after which the merge is rejected
   whole, so real shoppers' pageviews, sessions and funnel steps stop counting
   for the rest of the day and nothing on the dashboard says why.

   Each map therefore gets a key budget, and anything beyond it is counted under
   `other` rather than as its own field. The budget is tracked in this process
   instead of read back from Firestore: reading the day document before every
   pageview would double the cost of the cheapest write in the system. One
   process serves the shop, so this bounds the document in practice; a restart
   re-learns the keys, which costs one extra budget for that day, not an
   unbounded one. */
const KEY_BUDGET = { pages: 400, referrers: 200, regions: 200, cities: 200 };
const OTHER_KEY = 'other';

let budgetDay = null;
let budgetSets = new Map();

function budgetedKey(day, field, key) {
  const budget = KEY_BUDGET[field];
  if (!budget || !key) return key;

  // Only the current day is ever written, so yesterday's sets are dead weight.
  if (day !== budgetDay) {
    budgetDay = day;
    budgetSets = new Map();
  }

  let keys = budgetSets.get(field);
  if (!keys) {
    keys = new Set();
    budgetSets.set(field, keys);
  }

  if (keys.has(key)) return key;
  if (keys.size >= budget) return OTHER_KEY;
  keys.add(key);
  return key;
}

/** Referrers are reduced to a host: the full URL is a tracking surface. */
function referrerHost(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '');
    return host ? safeKey(host, 100) : null;
  } catch {
    return null;
  }
}

function deviceClass(value) {
  const raw = String(value ?? '').toLowerCase();
  if (DEVICES.includes(raw)) return raw;
  // Fall back to a coarse read of the UA string. Deliberately crude: this only
  // ever needs to fill three buckets.
  if (/ipad|tablet|playbook|silk/.test(raw)) return 'tablet';
  if (/mobi|android|iphone|ipod|phone/.test(raw)) return 'mobile';
  return 'desktop';
}

function boundedInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i >= min && i <= max ? i : null;
}

/* An edge geo header is only worth believing where an edge actually sets it.
   Nothing in front of the Hostinger VPS strips cf-ipcountry or x-geo-*, so
   trusting them unconditionally would let any anonymous caller redraw the shop's
   map with a curl flag — and mint an unbounded number of new field keys while
   doing it. Off unless TRUST_EDGE_GEO names the platform in front. */
const EDGE_GEO = String(process.env.TRUST_EDGE_GEO || '').toLowerCase();

const EDGE_HEADERS = {
  cloudflare: { country: ['cf-ipcountry'], region: [], city: [] },
  vercel: {
    country: ['x-vercel-ip-country'],
    region: ['x-vercel-ip-country-region'],
    city: ['x-vercel-ip-city'],
  },
};

const ISO_COUNTRY = /^[A-Z]{2}$/;

/* IANA zone names look like Area/Location. Checking the shape keeps the region
   map to the few hundred zones that exist rather than whatever a caller sends,
   which is a cardinality ceiling as much as a validation. */
const IANA_ZONE = /^[A-Za-z][A-Za-z_+-]{0,24}(\/[A-Za-z0-9][A-Za-z0-9_+-]{0,24}){1,2}$/;

/**
 * Geography, best-effort and IP-free.
 *
 * The fallback is what the browser already tells every site it visits: its
 * locale region and IANA timezone. Neither is an identifier, and neither
 * requires storing — or even reading — the connection's IP address.
 *
 * These fallbacks are proxies, not facts: a visitor in Chennai with a device
 * set to Asia/Kolkata reports the same region as one in Kolkata. Good enough
 * to see where demand clusters, not evidence of anyone's location. City stays
 * empty without a trusted edge, which is what the dashboard says it will.
 */
function geoOf(body, headers = {}) {
  const edge = EDGE_HEADERS[EDGE_GEO] || null;
  const fromEdge = (kind) => {
    if (!edge) return null;
    for (const name of edge[kind]) {
      const value = safeKey(headers[name], 60);
      if (value) return value;
    }
    return null;
  };

  const raw = (fromEdge('country') || String(body?.locale || '').split('-')[1] || '')
    .toUpperCase();
  // Two letters or nothing: an arbitrary string here is both a forgery and a
  // key the dashboard could not name anyway.
  const country = ISO_COUNTRY.test(raw) ? raw : null;

  const zone = safeKey(body?.timezone, 40);
  const region = fromEdge('region') || (zone && IANA_ZONE.test(zone) ? zone : null);

  return { country, region, city: fromEdge('city') };
}

/* ------------------------------- ingestion ------------------------------- */

function validatePageview(body, headers) {
  const sessionId = safeKey(body?.sessionId, 128);
  if (!sessionId) return { error: 'sessionId is required' };

  return {
    value: {
      sessionId,
      path: normalizePath(body?.path),
      referrer: referrerHost(body?.referrer),
      device: deviceClass(body?.device || headers['user-agent']),
      // The visitor's own clock, which is the only one that makes an
      // hour-of-day heatmap mean anything for a shop with distant customers.
      hour: boundedInt(body?.hour, 0, 23),
      dow: boundedInt(body?.dow, 0, 6),
      // Derived from sessionStorage on the client, so it is a claim rather than
      // a fact. recordPageview only believes it if claimSession can create the
      // marker for it, which is what stops a script inflating the visit count.
      newSession: body?.newSession === true,
      ...geoOf(body, headers),
    },
  };
}

/** Merge-safe increment tree for one pageview. */
function pageviewPatch(v, day) {
  const patch = {
    day,
    updatedAtMs: Date.now(),
    pageviews: FieldValue.increment(1),
    pages: { [budgetedKey(day, 'pages', v.path)]: FieldValue.increment(1) },
    devices: { [v.device]: FieldValue.increment(1) },
  };

  if (v.hour !== null) patch.hours = { [String(v.hour)]: FieldValue.increment(1) };
  if (v.hour !== null && v.dow !== null) {
    patch.grid = { [`${v.dow}-${v.hour}`]: FieldValue.increment(1) };
  }

  /* Where a visitor came from and where they are: both are properties of the
     visit, not of the page, so both are counted once — on the hit that opened
     the session. Counting them per pageview would weight them by how much
     someone browsed, and would let a later hit contribute a coarser answer than
     the first: only the session's first hit resolves an address, so pageview
     two would file the same visitor again under their timezone and put
     "Asia/Kolkata" in a table of states. */
  if (v.newSession) {
    patch.sessions = FieldValue.increment(1);

    if (v.referrer) {
      patch.referrers = { [budgetedKey(day, 'referrers', v.referrer)]: FieldValue.increment(1) };
    }
    if (v.country) patch.countries = { [v.country]: FieldValue.increment(1) };

    /* Regions and cities are stored under a country-prefixed key so the
       dashboard can filter them by the country you click. A flat
       "Hyderabad: 40" cannot be attributed to anywhere, which would make that
       filter a lie. */
    const scope = v.country || UNKNOWN_COUNTRY;
    if (v.region) {
      const key = budgetedKey(day, 'regions', `${scope}${GEO_SEPARATOR}${v.region}`);
      patch.regions = { [key]: FieldValue.increment(1) };
    }
    if (v.city) {
      const key = budgetedKey(day, 'cities', `${scope}${GEO_SEPARATOR}${v.city}`);
      patch.cities = { [key]: FieldValue.increment(1) };
    }
  }

  // Two funnel steps the URL already proves, so the client is not trusted to
  // report them separately.
  if (v.path.startsWith('/product/')) {
    patch.funnel = { productViews: FieldValue.increment(1) };
  } else if (v.path === '/checkout') {
    patch.funnel = { checkoutStarts: FieldValue.increment(1) };
  }

  return patch;
}

/**
 * Claim a session for a day, returning whether this call is the one that
 * created it.
 *
 * The client's own newSession flag cannot be trusted on its own: a script
 * setting it on every request would inflate the session count without limit,
 * and sessions are the number the conversion rate divides by. create() fails
 * when the marker already exists, so exactly one caller per session per day
 * gets true. It is only attempted when the client claims a new session — a
 * client that under-claims only loses its own visit, which is harmless, and
 * checking every pageview would spend a write on a question already answered.
 */
async function claimSession(db, day, sessionId) {
  if (!sessionId) return false;
  try {
    await db
      .collection('siteSessions')
      .doc(`${day}_${sessionId}`.slice(0, 150))
      .create({ day, sessionId, createdAtMs: Date.now() });
    return true;
  } catch {
    // Already claimed. Expected for a reload inside a live session.
    return false;
  }
}

/**
 * Geography for a session's first pageview.
 *
 * The address is resolved and discarded inside this function; only the place
 * names reach the caller. Behind the VPS's own reverse proxy the trustworthy
 * client address is the last X-Forwarded-For entry, which lib/geo handles.
 * Whatever the visitor's locale suggested stays as the fallback, so a lookup
 * that times out degrades to a coarser answer rather than to nothing.
 */
async function resolveGeo(req, fallback) {
  if (!req) return fallback;
  try {
    const geo = await lookupGeo(getClientIp(req));
    const named = (value) => (value && value !== 'Unknown' ? value : null);
    return {
      country: geo.countryCode || fallback.country,
      region: named(geo.region) || fallback.region,
      city: named(geo.city) || fallback.city,
    };
  } catch {
    // Geo enrichment must never cost the shop a pageview.
    return fallback;
  }
}

async function recordPageview(db, body, req) {
  const { value, error } = validatePageview(body, req?.headers || {});
  if (error) return { error };

  const day = dayKeyFor(Date.now());

  /* Both of the expensive steps happen only on a session's first hit: the
     marker write that proves it, and the geo lookup it gates. Every later
     pageview in that session is two cheap merges and nothing else. */
  value.newSession = value.newSession && (await claimSession(db, day, value.sessionId));
  if (value.newSession) {
    Object.assign(value, await resolveGeo(req, value));
  }

  // Presence and aggregates are independent: a failed prune must not cost the
  // shop a pageview, so neither write blocks the other.
  const results = await Promise.allSettled([
    db.collection('siteMetrics').doc(day).set(pageviewPatch(value, day), { merge: true }),
    touchLiveSession(db, value.sessionId),
  ]);

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length) {
    console.error(
      `[site] ${failures.length} pageview write(s) failed:`,
      failures.map((f) => f.reason?.message).join('; '),
    );
  }

  return { ok: true, day };
}

/**
 * A funnel step the URL cannot imply — currently only add-to-cart.
 *
 * Kept separate from recordPageview so that adding a step can never risk
 * double-counting a navigation.
 */
async function recordFunnelStage(db, body) {
  const stage = String(body?.stage || '');
  if (!FUNNEL_STAGES.includes(stage)) {
    return { error: `Unsupported funnel stage. Allowed: ${FUNNEL_STAGES.join(', ')}` };
  }
  if (!safeKey(body?.sessionId, 128)) return { error: 'sessionId is required' };

  const day = dayKeyFor(Date.now());
  await db
    .collection('siteMetrics')
    .doc(day)
    .set(
      { day, updatedAtMs: Date.now(), funnel: { [stage]: FieldValue.increment(1) } },
      { merge: true },
    );

  return { ok: true, day, stage };
}

/* ----------------------------- live presence ----------------------------- */

/**
 * Presence lives in one document holding `{ [sessionId]: lastSeenMs }`.
 *
 * One document means the live count costs exactly one read no matter how busy
 * the shop is. Stale keys are removed with targeted FieldValue.delete() calls
 * rather than by rewriting the map, so a prune can never discard a session
 * that arrived while it was running.
 */
async function touchLiveSession(db, sessionId) {
  const ref = db.collection(LIVE_COLLECTION).doc(LIVE_DOC);
  const now = Date.now();

  await ref.set({ sessions: { [sessionId]: now }, updatedAtMs: now }, { merge: true });

  // Prune on roughly one hit in ten. The map only ever holds a few minutes of
  // sessions, so this is about keeping the document small, not correctness —
  // liveVisitors() filters by age regardless of what is still in there.
  if (Math.random() > 0.1) return;

  const snap = await ref.get().catch(() => null);
  const sessions = snap?.data()?.sessions;
  if (!sessions) return;

  const entries = Object.entries(sessions);
  const isStale = ([, seen]) => now - Number(seen || 0) > LIVE_WINDOW_MS;
  const stale = entries.filter(isStale);
  const fresh = entries.filter((e) => !isStale(e));

  // A hard ceiling as well, so a traffic burst cannot grow the document toward
  // Firestore's 1 MB limit faster than the age-based prune clears it. Oldest
  // sessions are dropped first.
  const overflow =
    fresh.length > LIVE_MAX_SESSIONS
      ? [...fresh]
          .sort((a, b) => Number(a[1]) - Number(b[1]))
          .slice(0, fresh.length - LIVE_MAX_SESSIONS)
      : [];

  const drop = [...stale, ...overflow];
  if (!drop.length) return;

  const deletions = {};
  for (const [sid] of drop) deletions[sid] = FieldValue.delete();
  await ref.set({ sessions: deletions }, { merge: true }).catch(() => {});
}

async function liveVisitors(db) {
  const snap = await db.collection(LIVE_COLLECTION).doc(LIVE_DOC).get();
  const sessions = snap.exists ? snap.data()?.sessions || {} : {};
  const cutoff = Date.now() - LIVE_WINDOW_MS;

  let live = 0;
  for (const seen of Object.values(sessions)) {
    if (Number(seen || 0) >= cutoff) live += 1;
  }

  return { ok: true, live, windowMinutes: LIVE_WINDOW_MS / 60_000 };
}

/* -------------------------------- reading -------------------------------- */

async function getAllChunked(db, refs) {
  const docs = [];
  for (let i = 0; i < refs.length; i += GETALL_CHUNK) {
    const chunk = refs.slice(i, i + GETALL_CHUNK);
    // Sequential by design: chunking exists to bound how many reads are in
    // flight, which firing them all at once would defeat.
    // eslint-disable-next-line no-await-in-loop
    docs.push(...(await db.getAll(...chunk)));
  }
  return docs;
}

const numberOf = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/** Sum a `{ key: count }` map across every day in the range into one map. */
function mergeMaps(days, field) {
  const out = {};
  for (const day of days) {
    const map = day?.[field];
    if (!map || typeof map !== 'object') continue;
    for (const [key, value] of Object.entries(map)) {
      out[key] = (out[key] || 0) + numberOf(value);
    }
  }
  return out;
}

function topList(map, limit = 12) {
  return Object.entries(map)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/**
 * Split a country-prefixed geo map back into rows the dashboard can filter.
 *
 * Keys written before this prefix existed have no separator; they are kept and
 * reported as unknown-country rather than dropped, so no history is lost.
 */
function geoList(map, limit = 40) {
  return Object.entries(map)
    .map(([key, count]) => {
      const cut = key.indexOf(GEO_SEPARATOR);
      return cut === -1
        ? { label: key, country: UNKNOWN_COUNTRY, count }
        : { label: key.slice(cut + 1), country: key.slice(0, cut), count };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/**
 * Resolve the requested window into an inclusive day-key range plus the equal
 * length window immediately before it, which is what every up/down arrow on
 * the dashboard compares against.
 */
function resolveRange({ days, from, to } = {}) {
  let startKey;
  let endKey;

  if (isDayKey(from) && isDayKey(to)) {
    startKey = from <= to ? from : to;
    endKey = from <= to ? to : from;
    // A hand-picked range still cannot outrun the cap on reads.
    if (daysBetween(startKey, endKey) > MAX_DAYS) {
      startKey = shiftDayKey(endKey, -(MAX_DAYS - 1));
    }
  } else {
    // Clamped rather than rejected: a caller asking for more history than the
    // read cap allows wants as much as it can have, not the 7-day default.
    const raw = Number(days);
    const requested = Number.isFinite(raw)
      ? Math.min(MAX_DAYS, Math.max(1, Math.trunc(raw)))
      : 7;
    endKey = dayKeyFor(Date.now());
    startKey = shiftDayKey(endKey, -(requested - 1));
  }

  const current = dayKeyRange(startKey, endKey);
  const span = current.length;
  const prevEnd = shiftDayKey(current[0], -1);
  const previous = dayKeyRange(shiftDayKey(prevEnd, -(span - 1)), prevEnd);

  return { current, previous, startKey: current[0], endKey: current[span - 1] };
}

/**
 * Orders covering both windows in one query.
 *
 * Bounded at both ends, so a range that ended months ago reads that range
 * rather than everything placed since — an open upper bound would spend the cap
 * on orders newer than the window and then report the result as partial. Only
 * createdAt is filtered and ordered, so Firestore's automatic single-field index
 * serves it: no composite index to deploy before the dashboard works.
 */
async function loadOrders(db, fromMs, toMs) {
  const snap = await db
    .collection('orders')
    .where('createdAt', '>=', Timestamp.fromMillis(fromMs))
    .where('createdAt', '<=', Timestamp.fromMillis(toMs))
    .orderBy('createdAt', 'asc')
    .limit(ORDERS_CAP)
    .get();

  const orders = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const ms = data.createdAt?.toMillis?.();
    if (!ms || ms > toMs) continue;
    orders.push({
      day: dayKeyFor(ms),
      total: numberOf(data.total),
      status: String(data.status || ''),
      items: Array.isArray(data.items) ? data.items : [],
    });
  }

  const truncated = snap.size === ORDERS_CAP;
  if (truncated) {
    console.warn(`[site] orders query hit the ${ORDERS_CAP}-doc cap; totals are partial`);
  }

  return { orders, truncated };
}

function summarizeOrders(orders, dayKeys) {
  const inRange = new Set(dayKeys);
  const byDay = {};
  let count = 0;
  let revenue = 0;

  for (const order of orders) {
    if (!inRange.has(order.day) || VOID_STATUSES.has(order.status)) continue;
    count += 1;
    revenue += order.total;
    byDay[order.day] = byDay[order.day] || { orders: 0, revenue: 0 };
    byDay[order.day].orders += 1;
    byDay[order.day].revenue += order.total;
  }

  return { count, revenue: Math.round(revenue * 100) / 100, byDay };
}

function topProducts(orders, dayKeys, limit = 10) {
  const inRange = new Set(dayKeys);
  const tally = new Map();

  for (const order of orders) {
    if (!inRange.has(order.day) || VOID_STATUSES.has(order.status)) continue;
    for (const item of order.items) {
      const id = safeKey(item?.id, 128);
      if (!id) continue;
      const entry = tally.get(id) || {
        id,
        name: String(item?.name || 'Unnamed product').slice(0, 120),
        units: 0,
        revenue: 0,
      };
      const qty = Math.max(1, numberOf(item?.quantity) || 1);
      entry.units += qty;
      entry.revenue += numberOf(item?.price) * qty;
      tally.set(id, entry);
    }
  }

  return [...tally.values()]
    .map((p) => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }))
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
    .slice(0, limit);
}

/* Percent change. null means "nothing to compare against" — the dashboard
   shows a dash for that rather than a misleading +100%. */
function delta(current, previous) {
  if (!Number.isFinite(previous) || previous === 0) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function totalsFor(days, orderSummary) {
  const pageviews = days.reduce((sum, d) => sum + numberOf(d?.pageviews), 0);
  const sessions = days.reduce((sum, d) => sum + numberOf(d?.sessions), 0);
  return {
    pageviews,
    sessions,
    orders: orderSummary.count,
    revenue: orderSummary.revenue,
    // Derived here so the dashboard is not recomputing them on every render.
    viewsPerSession: sessions > 0 ? Math.round((pageviews / sessions) * 100) / 100 : 0,
    conversionRate: sessions > 0 ? Math.round((orderSummary.count / sessions) * 1000) / 10 : 0,
    avgOrderValue:
      orderSummary.count > 0
        ? Math.round((orderSummary.revenue / orderSummary.count) * 100) / 100
        : 0,
  };
}

/**
 * Everything the dashboard renders, in one response.
 *
 * Read cost: (current + previous) day documents via getAll, plus one capped
 * orders query. Nothing here scales with total collection size.
 */
async function siteSnapshot(db, query = {}) {
  const { current, previous, startKey, endKey } = resolveRange(query);

  const allKeys = [...previous, ...current];
  const refs = allKeys.map((key) => db.collection('siteMetrics').doc(key));

  const rangeStartMs = dayStartMs(previous[0] || startKey);
  const rangeEndMs = dayStartMs(endKey) + 86_400_000 - 1;

  const [docs, orderData] = await Promise.all([
    getAllChunked(db, refs),
    loadOrders(db, rangeStartMs, rangeEndMs).catch((error) => {
      // A failed orders read must not take the whole dashboard down — traffic
      // figures are still worth showing, and dataGaps says what is missing.
      console.error('[site] orders load failed:', error.message);
      return { orders: [], truncated: false, failed: true };
    }),
  ]);

  const byKey = new Map();
  docs.forEach((doc, i) => byKey.set(allKeys[i], doc?.exists ? doc.data() : null));

  const currentDays = current.map((key) => byKey.get(key));
  const previousDays = previous.map((key) => byKey.get(key));

  const currentOrders = summarizeOrders(orderData.orders, current);
  const previousOrders = summarizeOrders(orderData.orders, previous);

  const totals = totalsFor(currentDays, currentOrders);
  const previousTotals = totalsFor(previousDays, previousOrders);

  const series = current.map((key) => {
    const day = byKey.get(key);
    const orders = currentOrders.byDay[key] || { orders: 0, revenue: 0 };
    return {
      day: key,
      pageviews: numberOf(day?.pageviews),
      sessions: numberOf(day?.sessions),
      orders: orders.orders,
      revenue: Math.round(orders.revenue * 100) / 100,
    };
  });

  const funnelMap = mergeMaps(currentDays, 'funnel');
  const funnel = {
    productViews: numberOf(funnelMap.productViews),
    addToCart: numberOf(funnelMap.addToCart),
    checkoutStarts: numberOf(funnelMap.checkoutStarts),
    // From orders, never from an event: this is the one step that must be real.
    purchases: currentOrders.count,
  };

  const devicesMap = mergeMaps(currentDays, 'devices');
  const hoursMap = mergeMaps(currentDays, 'hours');
  const gridMap = mergeMaps(currentDays, 'grid');

  return {
    ok: true,
    range: { from: startKey, to: endKey, days: current.length },
    previousRange: { from: previous[0] || null, to: previous[previous.length - 1] || null },
    totals,
    previousTotals,
    deltas: {
      pageviews: delta(totals.pageviews, previousTotals.pageviews),
      sessions: delta(totals.sessions, previousTotals.sessions),
      orders: delta(totals.orders, previousTotals.orders),
      revenue: delta(totals.revenue, previousTotals.revenue),
      viewsPerSession: delta(totals.viewsPerSession, previousTotals.viewsPerSession),
      conversionRate: delta(totals.conversionRate, previousTotals.conversionRate),
      avgOrderValue: delta(totals.avgOrderValue, previousTotals.avgOrderValue),
    },
    series,
    funnel,
    devices: DEVICES.map((label) => ({ label, count: numberOf(devicesMap[label]) })),
    hours: Array.from({ length: 24 }, (_, h) => numberOf(hoursMap[String(h)])),
    grid: Array.from({ length: 7 }, (_, dow) =>
      Array.from({ length: 24 }, (_, hour) => numberOf(gridMap[`${dow}-${hour}`])),
    ),
    pages: topList(mergeMaps(currentDays, 'pages'), 12),
    referrers: topList(mergeMaps(currentDays, 'referrers'), 12),
    countries: topList(mergeMaps(currentDays, 'countries'), 12),
    // Deeper lists, and each row carries its country, so clicking a country
    // filters these two client-side without another request.
    regions: geoList(mergeMaps(currentDays, 'regions'), 60),
    cities: geoList(mergeMaps(currentDays, 'cities'), 60),
    topProducts: topProducts(orderData.orders, current, 10),
    dataGaps: {
      // Stated rather than hidden: the dashboard renders a note from these so
      // a capped or failed read never reads as a quiet day.
      ordersTruncated: Boolean(orderData.truncated),
      ordersUnavailable: Boolean(orderData.failed),
      trackingDays: currentDays.filter(Boolean).length,
    },
  };
}

module.exports = {
  recordPageview,
  recordFunnelStage,
  liveVisitors,
  siteSnapshot,
  // Exported for tests and for any future aggregation job.
  dayKeyFor,
  dayStartMs,
  resolveRange,
  delta,
};
