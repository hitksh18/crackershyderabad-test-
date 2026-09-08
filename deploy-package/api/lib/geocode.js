'use strict';

/* ---------------------------------------------------------------------------
   Delivery coordinates: validation, and reverse geocoding through the server.

   Two reasons the lookup is proxied rather than called from the browser:

   • Nominatim's usage policy requires a descriptive User-Agent naming the
     application. A browser cannot set that header, so a direct call from the
     checkout page is an anonymous one — the kind their operators block.
   • The Google key, if one is configured, stays on the server. A key shipped to
     the browser is a key anyone can lift and bill to this shop.

   The provider is chosen by what is configured, and the shape returned is the
   same either way so the checkout page never has to care which answered.
   ------------------------------------------------------------------------- */

const GOOGLE_KEY = String(process.env.GOOGLE_GEOCODING_API_KEY || '').trim();

/* Matches client/src/utils/deliveryLocation.js. ~0.11 m — finer than any
   consumer GPS fix. */
const PRECISION = 6;

/* A checkout page is waiting on this. Better to hand back "we could not resolve
   it, type the address yourself" quickly than to hold the field hostage to a
   slow third party. */
const LOOKUP_TIMEOUT_MS = 5000;

/* Customers nudge the pin repeatedly to get the doorstep right, and each nudge
   is a lookup. Rounding the cache key to four decimals (~11 m) collapses that
   fidgeting into one upstream call. */
const CACHE_PRECISION = 4;
const CACHE_MAX = 500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/* Place search. Results are biased towards Hyderabad so a bare "Kukatpally"
   ranks the local one above its namesakes — a preference, not a fence, because
   people do order for addresses outside the city. Nominatim wants the box as
   lon,lat of the top-left then bottom-right corner. */
const SEARCH_VIEWBOX = '78.20,17.62,78.72,17.20';
const SEARCH_LIMIT = 5;

/* Below this a query matches half the state and the results are noise. */
const MIN_QUERY = 3;

/* Nominatim rejects generic agents and asks for a way to make contact. */
const USER_AGENT = 'CrackersHyderabad/1.0 (+https://crackershyderabad.com)';

const cache = new Map();

const round = (value) => Number(Number(value).toFixed(PRECISION));

/**
 * Accept a coordinate pair only if it is a real point on Earth.
 *
 * Shares its rules with the client helper of the same name, because the browser
 * uses them to decide whether to show a pin and this module uses them to decide
 * whether to store one — if the two disagreed, an order could display a pin the
 * invoice does not carry.
 */
function normaliseCoords(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  // Exactly 0,0 is what a client sends when its own coordinates were empty.
  if (latitude === 0 && longitude === 0) return null;

  return { lat: round(latitude), lng: round(longitude) };
}

const cleanText = (value, max = 120) =>
  String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max);

/** First non-empty candidate that has not already been used for another field. */
const pick = (candidates, used) => {
  for (const candidate of candidates) {
    const value = cleanText(candidate);
    if (value && !used.has(value)) {
      used.add(value);
      return value;
    }
  }
  return '';
};

/* India's PIN codes are six digits. Anything else in the postcode slot belongs
   to some other country's scheme and would fail the order validator downstream,
   so it is dropped here rather than typed into a field the customer then has to
   clear by hand. */
const indianPincode = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return /^\d{6}$/.test(digits) ? digits : '';
};

const cacheKey = (pin) =>
  `${pin.lat.toFixed(CACHE_PRECISION)},${pin.lng.toFixed(CACHE_PRECISION)}`;

/* Both caches share these: same TTL, same recency eviction, different contents
   (points keyed by rounded coordinates, searches keyed by lowercased query). */
function cacheGet(key, store) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  // Re-insert so the map's insertion order doubles as a recency list.
  store.delete(key);
  store.set(key, entry);
  return entry.value;
}

function cacheSet(key, value, store) {
  store.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  while (store.size > CACHE_MAX) {
    // Oldest insertion first, which after cacheGet's re-insert is the least
    // recently used.
    store.delete(store.keys().next().value);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`upstream returned ${response.status}`);
  return response.json();
}

/** Nominatim (OpenStreetMap). Free, no key, rate-limited by courtesy. */
async function viaNominatim(pin) {
  const url =
    'https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18' +
    `&lat=${pin.lat}&lon=${pin.lng}`;

  const data = await fetchJson(url);
  const a = data?.address || {};
  const used = new Set();

  /* Order matters: city is resolved before area, because `village` can stand for
     either and a small settlement should become the city rather than a locality
     inside a city that was never named. */
  const city = pick([a.city, a.town, a.municipality, a.village, a.county], used);
  const area = pick([a.suburb, a.neighbourhood, a.city_district, a.hamlet, a.residential], used);

  return {
    house: pick([a.house_number, a.house_name, a.building, a.amenity], used),
    street: pick([a.road, a.pedestrian, a.footway], used),
    area,
    city,
    state: cleanText(a.state, 80),
    pincode: indianPincode(a.postcode),
    label: cleanText(data?.display_name, 220),
  };
}

/** Google Geocoding. Used only when a key is configured; better India coverage. */
async function viaGoogle(pin) {
  const url =
    'https://maps.googleapis.com/maps/api/geocode/json' +
    `?latlng=${pin.lat},${pin.lng}&result_type=street_address|premise|subpremise|route` +
    `&key=${encodeURIComponent(GOOGLE_KEY)}`;

  const data = await fetchJson(url);
  if (data?.status !== 'OK' || !Array.isArray(data.results) || !data.results.length) {
    /* ZERO_RESULTS is an ordinary answer for a field or a new layout; anything
       else (REQUEST_DENIED, OVER_QUERY_LIMIT) is a configuration problem worth
       seeing in the log, because the shop would otherwise just notice that
       autofill quietly stopped working. */
    if (data?.status && data.status !== 'ZERO_RESULTS') {
      console.warn(`[geocode] google returned ${data.status}: ${data.error_message || ''}`);
    }
    return null;
  }

  const components = data.results[0].address_components || [];
  const of = (...types) => {
    for (const type of types) {
      const hit = components.find((c) => (c.types || []).includes(type));
      if (hit?.long_name) return hit.long_name;
    }
    return '';
  };

  const used = new Set();
  const city = pick([of('locality'), of('administrative_area_level_3'), of('postal_town')], used);
  const area = pick(
    [of('sublocality_level_1'), of('sublocality'), of('neighborhood'), of('administrative_area_level_2')],
    used,
  );

  return {
    house: pick([of('street_number'), of('premise'), of('subpremise')], used),
    street: pick([of('route')], used),
    area,
    city,
    state: cleanText(of('administrative_area_level_1'), 80),
    pincode: indianPincode(of('postal_code')),
    label: cleanText(data.results[0].formatted_address, 220),
  };
}

/** Which provider a lookup will use. Reported to the admin settings screen. */
const activeProvider = () => (GOOGLE_KEY ? 'google' : 'nominatim');

/* ---------------------------------------------------------------------------
   Place search — "where is my area?" rather than "what is at this point?"

   Panning a city-wide map to your own roof is slow on a phone and hopeless if
   you do not recognise the streets from above. Typing "Kukatpally" and tapping
   a result puts the map on the right block in one move; the pin is still placed
   by hand from there, because a search result is a locality centroid, not a
   doorstep.
   ------------------------------------------------------------------------- */

const searchCache = new Map();

/** Google Places-free text search via the Geocoding API's address mode. */
async function searchViaGoogle(query) {
  const url =
    'https://maps.googleapis.com/maps/api/geocode/json' +
    `?address=${encodeURIComponent(query)}&region=in&components=country:IN` +
    `&key=${encodeURIComponent(GOOGLE_KEY)}`;

  const data = await fetchJson(url);
  if (data?.status !== 'OK' || !Array.isArray(data.results)) {
    if (data?.status && data.status !== 'ZERO_RESULTS') {
      console.warn(`[geocode] google search returned ${data.status}: ${data.error_message || ''}`);
    }
    return [];
  }

  return data.results
    .slice(0, SEARCH_LIMIT)
    .map((result) => {
      const point = normaliseCoords(result.geometry?.location?.lat, result.geometry?.location?.lng);
      return point ? { ...point, label: cleanText(result.formatted_address, 220) } : null;
    })
    .filter(Boolean);
}

async function searchViaNominatim(query) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&countrycodes=in' +
    `&limit=${SEARCH_LIMIT}&viewbox=${SEARCH_VIEWBOX}&q=${encodeURIComponent(query)}`;

  const data = await fetchJson(url);
  if (!Array.isArray(data)) return [];

  return data
    .map((result) => {
      const point = normaliseCoords(result.lat, result.lon);
      return point ? { ...point, label: cleanText(result.display_name, 220) } : null;
    })
    .filter(Boolean);
}

/**
 * Look up places by name. Never throws — an empty list reads on screen as
 * "no matches", which is also the honest answer when the provider is down.
 */
async function searchPlaces(query) {
  const term = cleanText(query, 120);
  if (term.length < MIN_QUERY) return { ok: true, results: [] };

  const key = term.toLowerCase();
  const cached = cacheGet(key, searchCache);
  if (cached) return { ok: true, cached: true, results: cached };

  try {
    const results = GOOGLE_KEY ? await searchViaGoogle(term) : await searchViaNominatim(term);
    /* Only successful, non-empty answers are cached. Remembering "no matches"
       for a day would keep hiding a place the moment it gets added upstream. */
    if (results.length) cacheSet(key, results, searchCache);
    return { ok: true, cached: false, results };
  } catch (error) {
    console.warn(`[geocode] search failed for "${key}": ${error.message}`);
    return { ok: false, results: [] };
  }
}

/** GET /api/geocode/search?q= */
async function handleSearchPlaces(req, res) {
  const result = await searchPlaces(req.query?.q);
  if (!result.ok) {
    return res.status(503).json({ error: 'Place search is unavailable right now', results: [] });
  }
  return res.json({ provider: activeProvider(), results: result.results });
}

/**
 * Resolve a pin to address fields.
 *
 * Never throws: a failed lookup returns empty fields, and the checkout page
 * falls back to letting the customer type the address as it always could.
 */
async function reverseGeocode(pin) {
  const key = cacheKey(pin);
  const cached = cacheGet(key, cache);
  if (cached) return { ok: true, cached: true, provider: activeProvider(), address: cached };

  try {
    const address = GOOGLE_KEY ? await viaGoogle(pin) : await viaNominatim(pin);
    if (!address) return { ok: true, cached: false, provider: activeProvider(), address: null };

    cacheSet(key, address, cache);
    return { ok: true, cached: false, provider: activeProvider(), address };
  } catch (error) {
    console.warn(`[geocode] reverse lookup failed for ${key}: ${error.message}`);
    return { ok: false, provider: activeProvider(), address: null };
  }
}

/**
 * GET /api/geocode/reverse?lat=&lng=
 *
 * Returns 200 with `address: null` when the point simply has no address on
 * file. That is not an error the customer needs to see — the pin is still the
 * thing the driver navigates to, and the fields stay theirs to fill in.
 */
async function handleReverseGeocode(req, res) {
  const pin = normaliseCoords(req.query?.lat, req.query?.lng);
  if (!pin) return res.status(400).json({ error: 'A valid lat and lng are required' });

  const result = await reverseGeocode(pin);
  if (!result.ok) {
    return res.status(503).json({ error: 'Address lookup is unavailable right now', address: null });
  }

  return res.json({ lat: pin.lat, lng: pin.lng, provider: result.provider, address: result.address });
}

/**
 * GET /api/geocode/config
 *
 * Tells the admin settings screen which provider is live. Deliberately reports
 * only the provider name — never the key, nor any part of it.
 */
function handleGeocodeConfig(req, res) {
  res.json({ provider: activeProvider(), googleConfigured: Boolean(GOOGLE_KEY) });
}

module.exports = {
  normaliseCoords,
  reverseGeocode,
  searchPlaces,
  handleReverseGeocode,
  handleSearchPlaces,
  handleGeocodeConfig,
  activeProvider,
};
