'use strict';

/* ---------------------------------------------------------------------------
   Session geolocation.

   On the first page view of a session we resolve the caller's IP down to
   country / region / city using a free no-key provider (ipwho.is, with
   ip-api.com as fallback). Results are cached in memory; raw IPs are never
   persisted anywhere — only the derived place names land in aggregates.

   The VPS runs behind a local reverse proxy, so the trustworthy client IP
   is the LAST entry of X-Forwarded-For (the address our own proxy saw),
   which cannot be forged by the client.
   ------------------------------------------------------------------------- */

const LOOKUP_TIMEOUT_MS = 3000;
const CACHE_MAX = 5000;
const cache = new Map(); // ip -> { country, region, city }

function getClientIp(req) {
  const forwarded = req.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.get('x-real-ip') || req.socket?.remoteAddress || '';
}

function isPublicIp(ip) {
  if (!ip) return false;
  if (ip.includes(':') && !ip.startsWith('::ffff:')) {
    // Bare IPv6 — treat loopback/link-local/ULA as private, everything else public.
    const low = ip.toLowerCase();
    return !(low === '::1' || low.startsWith('fe80:') || low.startsWith('fc') || low.startsWith('fd'));
  }
  const v4 = ip.replace(/^::ffff:/i, '');
  const match = v4.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const [a, b] = [Number(match[1]), Number(match[2])];
  if ([a, b, Number(match[3]), Number(match[4])].some((n) => n > 255)) return false;
  if (a === 10 || a === 127 || a === 0) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 169 && b === 254) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  return true;
}

/* A provider can return an empty string, a three-letter code or nonsense. Only
   ISO-3166 alpha-2 is usable downstream, so anything else becomes null. */
function isoCode(raw) {
  const code = String(raw || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'crackershyderabad-site-analytics' },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve { countryCode, country, region, city } for an IP. Never throws.
 *
 * countryCode is carried alongside the display name because the dashboard
 * keys its country filter by ISO alpha-2 and renders the name from it — a
 * provider spelling ("Türkiye" vs "Turkey") must not be able to split one
 * country into two rows.
 */
async function lookupGeo(rawIp) {
  const UNKNOWN = { countryCode: null, country: 'Unknown', region: 'Unknown', city: 'Unknown' };
  try {
    const ip = String(rawIp || '').replace(/^::ffff:/i, '').trim();
    if (!isPublicIp(ip)) return UNKNOWN;

    const hit = cache.get(ip);
    if (hit) return hit;

    let geo = null;
    const primary = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`, LOOKUP_TIMEOUT_MS);
    if (primary && primary.success !== false && (primary.country || primary.city)) {
      geo = {
        countryCode: isoCode(primary.country_code),
        country: String(primary.country || 'Unknown').slice(0, 60),
        region: String(primary.region || 'Unknown').slice(0, 60),
        city: String(primary.city || 'Unknown').slice(0, 60),
      };
    } else {
      // Fallback provider (http-only on the free tier; server-to-server).
      const fallback = await fetchJson(
        `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=country,countryCode,regionName,city`,
        LOOKUP_TIMEOUT_MS,
      );
      if (fallback && fallback.country) {
        geo = {
          countryCode: isoCode(fallback.countryCode),
          country: String(fallback.country || 'Unknown').slice(0, 60),
          region: String(fallback.regionName || 'Unknown').slice(0, 60),
          city: String(fallback.city || 'Unknown').slice(0, 60),
        };
      }
    }

    const result = geo || UNKNOWN;
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
    cache.set(ip, result);
    return result;
  } catch {
    return UNKNOWN;
  }
}

module.exports = { getClientIp, isPublicIp, lookupGeo };
