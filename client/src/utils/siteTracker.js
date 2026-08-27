/* ---------------------------------------------------------------------------
   First-party visitor tracking.

   Posts one pageview per SPA navigation to /api/site/pageview, plus the one
   funnel step no URL implies: add-to-cart. Product views and reaching checkout
   are derived server-side from the path, so they are deliberately not sent from
   here — sending them too would count each of them twice.

   What is sent: the path, the referrer host, a coarse device class, the
   visitor's local hour and weekday, their locale and IANA timezone, and a
   random per-tab session id. What is never sent: anything identifying. The
   server stores no IP address either.

   Every call is fire-and-forget. Analytics must never delay a page, and a
   failed beacon must never surface an error to a shopper.
   --------------------------------------------------------------------------- */

const SESSION_KEY = 'ch_session_id';
const OVERRIDE_KEY = 'ch_track_analytics';

/* Staff surfaces are excluded. The shop's own people work in here all day, and
   counting them would drown the customer numbers the dashboard exists to show.
   Prefix-matched, so nested admin routes are covered without listing each. */
const EXCLUDED_PREFIXES = ['/admin', '/price-list'];

/* Repeated navigations to the same path inside this window count once. React
   runs effects twice in development's strict mode, and a route can re-render
   for reasons that are not a new visit. */
const DEDUPE_MS = 1500;

let cachedSessionId = null;
let sessionIsNew = false;
let lastPath = null;
let lastSentAt = 0;

/**
 * Whether tracking should run at all.
 *
 * Local development and local production previews both talk to the same
 * Firestore project as the live shop, so they are off by default — otherwise
 * every dev reload would inflate the owner's traffic figures. The build mode is
 * checked first because it is decided at compile time: the hostname check alone
 * would let tracking through whenever the dev server is reached on a LAN IP
 * instead of localhost, which is exactly how it gets opened on a phone. Set
 * localStorage.ch_track_analytics = '1' to test the pipeline deliberately.
 */
function isEnabled() {
  try {
    if (localStorage.getItem(OVERRIDE_KEY) === '1') return true;
    if (!import.meta.env.PROD) return false;
    const host = window.location.hostname;
    return host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.local');
  } catch {
    return false;
  }
}

/**
 * A per-tab session id.
 *
 * sessionStorage, not localStorage: a "session" should end when the tab does,
 * which is what makes sessions a visit count rather than a device count. The
 * first read of a tab reports newSession so the server counts the visit once.
 */
function sessionId() {
  if (cachedSessionId) return cachedSessionId;

  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) {
      cachedSessionId = existing;
      sessionIsNew = false;
      return cachedSessionId;
    }

    const bytes = new Uint8Array(9);
    crypto.getRandomValues(bytes);
    cachedSessionId = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('');
    /* Flagged before the write, not after: a device whose storage is full can
       read but not write, and losing this flag would mean the visit is never
       counted as a session and its referrer is thrown away. */
    sessionIsNew = true;
    sessionStorage.setItem(SESSION_KEY, cachedSessionId);
    return cachedSessionId;
  } catch {
    // Private browsing can refuse storage. Track the visit anyway, in memory,
    // rather than losing it — the id just will not survive a reload.
    if (!cachedSessionId) {
      cachedSessionId = `mem-${Math.random().toString(36).slice(2, 11)}`;
      sessionIsNew = true;
    }
    return cachedSessionId;
  }
}

/** Three buckets is all the dashboard shows, so this stays deliberately crude. */
function deviceClass() {
  const ua = navigator.userAgent || '';
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'mobile';
  return 'desktop';
}

/* Stands in for geography when no CDN geo header is available. It is a hint,
   not a location: everyone in India reports Asia/Kolkata. */
function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

function post(path, body) {
  // keepalive lets the request outlive the navigation that triggered it, which
  // is what makes a fire-and-forget beacon actually arrive.
  fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {
    // Silent by design: a shopper must never see an analytics failure.
  });
}

/**
 * The referrer, but only when it is genuinely external and genuinely the entry
 * point of this session.
 *
 * document.referrer does not change during SPA navigation, so sending it every
 * time would credit one arrival from Google with a referral per page the
 * visitor then browsed. Same-origin referrers are dropped too: a reload is not
 * a referral from ourselves.
 */
function entryReferrer() {
  if (!sessionIsNew) return '';
  const raw = document.referrer || '';
  if (!raw) return '';
  try {
    return new URL(raw).origin === window.location.origin ? '' : raw;
  } catch {
    return '';
  }
}

export function isTrackedPath(pathname) {
  /* Lower-cased before comparing, because the router matches routes
     case-insensitively: /Admin/dashboard renders the admin page just as
     /admin/dashboard does, and staff traffic must be excluded either way. */
  const path = String(pathname || '').toLowerCase();
  return !EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function trackPageview(pathname) {
  if (!isEnabled() || !isTrackedPath(pathname)) return;

  const now = Date.now();
  if (pathname === lastPath && now - lastSentAt < DEDUPE_MS) return;
  lastPath = pathname;
  lastSentAt = now;

  const id = sessionId();
  const clock = new Date();

  post('/api/site/pageview', {
    sessionId: id,
    path: pathname,
    // Only the first hit of a tab claims a new session; every later navigation
    // is a pageview within it.
    newSession: sessionIsNew,
    referrer: entryReferrer(),
    device: deviceClass(),
    // The visitor's own clock, which is what makes the hour-of-day heatmap
    // mean anything for customers outside Hyderabad.
    hour: clock.getHours(),
    dow: clock.getDay(),
    locale: navigator.language || '',
    timezone: timeZone(),
  });

  // Cleared after the first send so a second navigation cannot re-count the
  // visit or re-credit the referrer.
  sessionIsNew = false;
}

/**
 * A funnel step the URL cannot prove. Currently only 'addToCart' — the server
 * rejects anything else, precisely so a stage that is already derived from the
 * path cannot also be reported from here.
 */
export function trackFunnel(stage) {
  if (!isEnabled()) return;
  post('/api/site/funnel', { sessionId: sessionId(), stage });
}
