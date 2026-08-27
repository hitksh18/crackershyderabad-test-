/**
 * Google Analytics glue.
 *
 * GA4 only. First-party pageviews are the job of utils/siteTracker, which posts
 * to /api/site/pageview and is what the admin dashboard reads — routing them
 * through here as well would count every visit twice in the shop's own
 * numbers. Product-level events still go to /api/events, because those feed
 * recommendations rather than traffic.
 *
 * gtag('config') already fires a page_view for the initial load, so the router
 * hook skips its first invocation — otherwise every landing page would be
 * counted twice in GA4.
 */

const SESSION_STORAGE_KEY = 'ch_sid';

/** Stable per-tab session id used to attribute events server-side. */
export const getSessionId = () => {
  try {
    let sid = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!sid) {
      sid = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_STORAGE_KEY, sid);
    }
    return sid;
  } catch {
    /* Storage blocked (private mode) — fall back to a throwaway id. */
    return `s-anon-${Math.random().toString(36).slice(2, 12)}`;
  }
};

/** Fire-and-forget POST to the event ingestion endpoint. */
const sendSiteEvent = (payload) => {
  try {
    const body = JSON.stringify({ ...payload, sessionId: getSessionId() });

    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* analytics must never break navigation */
  }
};

export const trackPageview = (path, title) => {
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'page_view', {
      page_path: path,
      page_title: title || document.title,
    });
  }
};

/** Product-level behavioural signal (feeds recommendations + dashboards). */
export const trackProductEvent = (type, { productId, category } = {}) => {
  if (!productId) return;
  sendSiteEvent({ type, productId: String(productId), category: category || null });
};
