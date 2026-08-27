'use strict';

/* ---------------------------------------------------------------------------
   Search intent analysis.

   Understands the store's 9 canonical categories, their synonyms, price
   qualifiers and common spelling variants so the engine can map a raw search
   query to: category intent, price preference and cleaned terms.
   ------------------------------------------------------------------------- */

const CATEGORIES = [
  'Rockets',
  'Sparkles',
  'Ground Chakkars',
  'Fancy Fireworks',
  'Gift Boxes',
  'Flower Pots',
  'Bombs',
  'Garlands',
  'Kids Special',
];

/* Canonical category -> search synonyms (lowercase, token-normalized). */
const CATEGORY_SYNONYMS = {
  Rockets: [
    'rocket', 'rockets', 'rocket bomb', 'chinese rocket', 'chinese rockets',
    'bottle rocket', 'bottle rockets', '800 rocket', '1000 rocket', 'rocket puffs',
  ],
  Sparkles: [
    'sparkle', 'sparkles', 'sparkler', 'sparklers', 'phool jhadi', 'phooljhadi',
    'gold sparkle', 'gold sparkler', 'silver sparkle', 'silver sparkler',
  ],
  'Ground Chakkars': [
    'chakkar', 'chakkars', 'ground chakkar', 'ground chakkars', 'spinning wheel',
    'spinning wheels', 'wheel', 'wheels', 'chakri', 'chakris', 'ground chakri',
  ],
  'Fancy Fireworks': [
    'fancy', 'fancy firework', 'fancy fireworks', 'fountain', 'fountains',
    'anar', 'anaar', 'flower fountain', 'flower fountains', 'jasmine', 'rajabook',
    'rocket fountain', 'fancy bomb',
  ],
  'Gift Boxes': [
    'gift box', 'gift boxes', 'gift pack', 'gift packs', 'gift', 'gifts',
    'combo', 'combos', 'gift set', 'gift sets', 'gift hamper', 'hamper',
  ],
  'Flower Pots': [
    'flower pot', 'flower pots', 'pot', 'pots', 'flame pot', 'flame pots',
    'flower pot bomb', 'small pot',
  ],
  Bombs: [
    'bomb', 'bombs', 'atom bomb', 'hydrogen bomb', 'hydro bomb', '1000 shot',
    '1000 shots', '5000 shot', '10000 shot', 'double color bomb', 'king bomb',
    '100 shot', '200 shot', '400 shot',
  ],
  Garlands: [
    'garland', 'garlands', 'ladi', 'ladis', 'ladi bomb', 'ladies bomb',
    'chinese garland', '100 garland', '200 garland', '500 garland',
  ],
  'Kids Special': [
    'kids', 'kid', 'children', 'kids special', 'kids pack', 'pencil', 'pencils',
    'chhota', 'chota', 'mini', 'snake', 'snake egg', 'bombs for kids',
  ],
};

/* Rewrite dictionary for common misspellings / short forms. */
const SPELLING_FIXES = {
  chakkar: 'chakkar',
  chakar: 'chakkar',
  chackar: 'chakkar',
  chakara: 'chakkar',
  chakri: 'chakkar',
  sparkler: 'sparkler',
  sparkal: 'sparkler',
  sparkel: 'sparkler',
  sparlker: 'sparkler',
  rocket: 'rocket',
  roket: 'rocket',
  rockit: 'rocket',
  anar: 'anar',
  anaar: 'anar',
  garlend: 'garland',
  garlan: 'garland',
  garlind: 'garland',
  ladi: 'ladi',
  ladhi: 'ladi',
  laddu: 'ladi',
  bom: 'bomb',
  bombes: 'bomb',
  boomb: 'bomb',
  pot: 'pot',
  pht: 'pot',
  gif: 'gift',
  gfts: 'gift',
  fancy: 'fancy',
  fansey: 'fancy',
};

/* Price qualifier patterns -> intent tags. */
const PRICE_PATTERNS = [
  { re: /\b(under|below|less than|upto|up to|within|max|maxim) (rs\.?\s*|₹\s*)?(\d{2,6})\b/i, field: 'maxPrice', group: 3 },
  { re: /\b(above|over|more than|min) (rs\.?\s*|₹\s*)?(\d{2,6})\b/i, field: 'minPrice', group: 3 },
  { re: /\b(rs\.?\s*|₹\s*)(\d{2,6})\s*(rupees)?\s*(and)?\s*(below|under|less)\b/i, field: 'maxPrice', group: 2 },
  { re: /<(\d{2,6})/, field: 'maxPrice', group: 1 },
  { re: />(\d{2,6})/, field: 'minPrice', group: 1 },
  { re: /\b(cheap|affordable|budget|low price|low budget)\b/i, field: 'budget', group: null },
  { re: /\b(premium|high end|best quality|top quality|expensive)\b/i, field: 'premium', group: null },
];

const QUALIFIERS = new Set([
  'best', 'top', 'popular', 'new', 'latest', 'online', 'cheap', 'under', 'below',
  'less', 'above', 'over', 'more', 'than', 'max', 'min', 'within', 'upto', 'up',
  'to', 'rs', 'rupees', 'rupee', 'price', 'budget', 'premium', 'and', 'or', 'for',
  'with', 'buy', 'shop', 'sale', 'offer', '2026', '2025', 'diwali', 'festival',
]);

const PLURAL_SUFFIX = /s$/;

/** Lowercase, strip punctuation, collapse whitespace. */
function normalizeQuery(raw) {
  if (!raw) return '';
  return String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9\s₹]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fix common misspellings token by token, singularize nouns. */
function cleanTokens(query) {
  const tokens = normalizeQuery(query).split(' ').filter(Boolean);
  const cleaned = [];
  for (let token of tokens) {
    if (QUALIFIERS.has(token)) continue;
    if (SPELLING_FIXES[token]) token = SPELLING_FIXES[token];
    else if (token.length > 3 && PLURAL_SUFFIX.test(token)) token = token.slice(0, -1);
    if (token && !cleaned.includes(token)) cleaned.push(token);
  }
  return cleaned;
}

/** Find the canonical category a query most likely refers to. */
function detectCategory(raw) {
  const query = ` ${normalizeQuery(raw)} `;
  let best = null;
  let bestScore = 0;

  for (const [category, synonyms] of Object.entries(CATEGORY_SYNONYMS)) {
    for (const syn of synonyms) {
      const pattern = ` ${normalizeQuery(syn)} `;
      if (query.includes(pattern)) {
        const score = syn.split(' ').length; // longer synonym match = stronger signal
        if (score > bestScore) {
          bestScore = score;
          best = category;
        }
      }
    }
  }
  return best;
}

/** Extract price constraints and intent qualifiers from a query. */
function detectPriceIntent(raw) {
  const intent = {};
  for (const { re, field, group } of PRICE_PATTERNS) {
    const match = String(raw || '').match(re);
    if (!match) continue;
    const value = group ? Number(match[group]) : null;
    if (field === 'maxPrice') intent.maxPrice = Math.min(intent.maxPrice ?? Infinity, value);
    if (field === 'minPrice') intent.minPrice = Math.max(intent.minPrice ?? 0, value);
    if (field === 'budget') intent.maxPrice = 1500; // "cheap" -> under ₹1500
    if (field === 'premium') intent.minPrice = 800; // "premium" -> from ₹800
  }
  return intent;
}

/** Full analysis of a raw search query. */
function analyzeSearch(raw) {
  const normalized = normalizeQuery(raw);
  const tokens = cleanTokens(raw);
  return {
    raw: String(raw || '').trim(),
    normalized,
    tokens,
    category: detectCategory(raw),
    price: detectPriceIntent(raw),
    hasMeaningfulTerms: tokens.length > 0,
  };
}

/** Do the product's categories overlap with the detected intent category? */
function matchesCategory(product, category) {
  if (!category) return false;
  const cats = product.categories || (product.category ? [product.category] : []);
  return cats.some((c) => c && c.toLowerCase() === category.toLowerCase());
}

module.exports = {
  CATEGORIES,
  CATEGORY_SYNONYMS,
  analyzeSearch,
  normalizeQuery,
  cleanTokens,
  detectCategory,
  detectPriceIntent,
  matchesCategory,
};