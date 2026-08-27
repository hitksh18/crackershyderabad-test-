const path = require('path');
const fs = require('fs');

/**
 * Backfill title-based slugs for every existing product.
 *
 * - slug = lowercase title, non-alphanumerics -> '-', collapsed, trimmed
 * - a manually curated seo.slug wins when present (keeps admin control)
 * - duplicates get -2, -3, ... suffixes
 * - the old seo.slug is retired into oldSlugs so past links keep resolving
 *
 * Idempotent: re-running only touches documents whose slug has drifted.
 */

const slugify = (title) =>
  String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'product';

async function main() {
  const { initializeApp, cert } = require('firebase-admin');
  const { getFirestore } = require('firebase-admin/firestore');
  const saPath = path.join(__dirname, '..', 'service-account.json');
  if (!fs.existsSync(saPath)) {
    console.log('NO_LOCAL_SA');
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(saPath, 'utf8'))) });
  const firestore = getFirestore();

  const productsSnap = await firestore.collection('products').get();
  const used = new Map();

  const ensureUnique = (base) => {
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    used.set(candidate, true);
    return candidate;
  };

  const batch = firestore.batch();
  let updates = 0;
  let unchanged = 0;

  for (const doc of productsSnap.docs) {
    const data = doc.data();
    const customSlug =
      typeof data.seo?.slug === 'string' && data.seo.slug.trim() ? slugify(data.seo.slug) : '';
    const base = customSlug || slugify(data.name);
    const slug = ensureUnique(base);

    const write = {};
    let needsUpdate = false;

    if (data.slug !== slug) {
      write.slug = slug;
      needsUpdate = true;
    }

    const oldSlugs = Array.isArray(data.oldSlugs)
      ? data.oldSlugs.filter((s) => typeof s === 'string')
      : [];
    if (customSlug && customSlug !== slug && !oldSlugs.includes(customSlug)) {
      oldSlugs.push(customSlug);
    }
    const deduped = [...new Set(oldSlugs)].slice(-25);
    if (JSON.stringify(deduped) !== JSON.stringify(data.oldSlugs || [])) {
      write.oldSlugs = deduped;
      needsUpdate = true;
    }

    if (needsUpdate) {
      batch.update(doc.ref, write);
      updates += 1;
      console.log(`slug: ${slug}  <=  ${data.name}`);
    } else {
      unchanged += 1;
    }
  }

  if (updates > 0) {
    await batch.commit();
  }
  console.log(`DONE: ${updates} updated, ${unchanged} unchanged, ${productsSnap.size} total`);
  process.exit(0);
}

main().catch((error) => {
  console.error('MIGRATION FAILED:', error.message);
  process.exit(1);
});