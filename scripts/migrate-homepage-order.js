'use strict';

/* ---------------------------------------------------------------------------
   One-time migration: fold the Festive Deals section into the stored
   homepage section order and align the storefront with the canonical order:

     Hero → Categories → Featured → Best Sellers → Festive Deals →
     Why Choose Us → Newsletter/Track → Wholesale → Footer

   Promo Banners and Admin Banner stay in the editor list but are disabled,
   matching the new default. Idempotent: re-running produces the same doc.

   Usage:
     node scripts/migrate-homepage-order.js
   ------------------------------------------------------------------------- */

const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const DEFAULT_ORDER = [
  'hero',
  'categories',
  'featured',
  'bestSellers',
  'deals',
  'promo',
  'adminBanner',
  'trust',
  'newsletterTrack',
  'wholesale',
  'footer',
];

const DEFAULT_DISABLED = new Set(['promo', 'adminBanner']);

const mergeMissing = (order) => {
  const present = new Set(order);
  const merged = [...order];
  DEFAULT_ORDER.forEach((id, defaultIndex) => {
    if (present.has(id)) return;
    merged.splice(Math.min(defaultIndex, merged.length), 0, id);
  });
  return merged;
};

const enforceOrder = (sections) => {
  const movable = sections.filter((s) => s.id !== 'wholesale' && s.id !== 'footer');
  const wholesale = sections.find((s) => s.id === 'wholesale');
  const footer = sections.find((s) => s.id === 'footer');
  const order = [...movable];
  if (wholesale) order.push(wholesale);
  if (footer) order.push(footer);
  return order;
};

async function main() {
  const saPath = path.join(__dirname, '..', 'service-account.json');
  if (!fs.existsSync(saPath)) {
    console.error('service-account.json not found in repo root — aborting');
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(saPath, 'utf8'))) });
  const db = getFirestore();

  const ref = db.collection('settings').doc('homepageSections');
  const snap = await ref.get();

  const storedOrder = snap.exists && Array.isArray(snap.data().order)
    ? snap.data().order
    : DEFAULT_ORDER;
  const storedEnabled = snap.exists && snap.data().enabled
    ? snap.data().enabled
    : {};

  const order = mergeMissing(storedOrder);
  const enabled = {};
  for (const id of order) {
    if (DEFAULT_DISABLED.has(id)) {
      // The canonical homepage order does not show these; they remain
      // re-enableable from the Canvas editor.
      enabled[id] = false;
    } else if (id in storedEnabled) {
      enabled[id] = storedEnabled[id] !== false;
    } else {
      enabled[id] = true;
    }
  }

  const sections = enforceOrder(order.map((id) => ({ id, enabled: enabled[id] !== false })));
  const next = {
    order: sections.map((s) => s.id),
    enabled: Object.fromEntries(sections.map((s) => [s.id, s.enabled])),
    status: 'published',
    updatedAt: new Date().toISOString(),
    updatedBy: 'migration-homepage-order',
  };

  await ref.set(next);
  console.log('Saved homepage section order:');
  sections.forEach((s, i) => console.log(`  ${i + 1}. ${s.id} (enabled: ${s.enabled})`));
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});