/**
 * Generate client/public/sitemap.xml from live Firestore products.
 *
 * Runs at deploy time (GitHub Actions) so every push publishes a sitemap
 * that includes every product page (/product/:slug) with an accurate
 * <lastmod> taken from each document's updatedAt/createdAt timestamp.
 *
 * Reads the products collection through Firestore's public REST API —
 * the same unauthenticated reads the storefront already performs, so no
 * service credentials are needed in CI.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'standard-crackers-store';
const SITE_URL = 'https://crackershyderabad.com';
const OUTPUT = join(__dirname, '..', 'client', 'public', 'sitemap.xml');

// Mirrors the storefront's category navigation (?category= URLs).
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

const xmlEscape = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const toDay = (timestamp) => {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

async function fetchAllProducts() {
  const products = [];

  // runQuery (not documents.list): the catalog fits far below the limit,
  // so a single structured query keeps the script free of cursor handling.
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'products' }],
          limit: 1000,
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Firestore REST ${response.status}: ${await response.text()}`);
  }

  const rows = await response.json();
  for (const row of rows || []) {
    const doc = row.document;
    if (!doc) continue;
    const fields = doc.fields || {};
    const slug = fields.slug?.stringValue;
    if (!slug) continue;
    products.push({
      slug,
      lastmod:
        toDay(fields.updatedAt?.timestampValue) ||
        toDay(fields.createdAt?.timestampValue) ||
        toDay(doc.updateTime),
    });
  }

  return products;
}

function buildXml(products) {
  const today = new Date().toISOString().slice(0, 10);
  const entries = [];

  entries.push(
    `  <url>
    <loc>${SITE_URL}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <lastmod>${today}</lastmod>
  </url>`,
    `  <url>
    <loc>${SITE_URL}/products</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
    <lastmod>${today}</lastmod>
  </url>`,
  );

  for (const category of CATEGORIES) {
    entries.push(
      `  <url>
    <loc>${SITE_URL}/products?category=${encodeURIComponent(category)}</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
    <lastmod>${today}</lastmod>
  </url>`,
    );
  }

  for (const product of products) {
    entries.push(
      `  <url>
    <loc>${SITE_URL}/product/${xmlEscape(product.slug)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
    <lastmod>${product.lastmod || today}</lastmod>
  </url>`,
    );
  }

  entries.push(
    `  <url>
    <loc>${SITE_URL}/track-order</loc>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
    <lastmod>${today}</lastmod>
  </url>`,
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`;
}

async function main() {
  console.log(`Fetching products from project "${PROJECT_ID}"...`);
  const products = await fetchAllProducts();
  console.log(`Found ${products.length} product(s) with slugs.`);

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, buildXml(products), 'utf8');
  console.log(`Sitemap written: ${OUTPUT}`);
}

main().catch((error) => {
  console.error('SITEMAP GENERATION FAILED:', error.name, '-', error.message);
  process.exit(1);
});
