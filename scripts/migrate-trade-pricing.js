#!/usr/bin/env node
'use strict';

/**
 * One-off migration: move wholesale pricing out of the public catalogue.
 *
 * `products` is world-readable, so `offlineMRP` / `offlineDiscountPrice` /
 * `offlinePrice` were visible to anyone with the public web config. This copies
 * them into `productPricing/{productId}` (staff-read only) and then removes
 * them from the product documents.
 *
 * Run a dry run first:
 *
 *   node scripts/migrate-trade-pricing.js
 *   node scripts/migrate-trade-pricing.js --commit
 *
 * Safe to re-run. Deploy the updated firestore.rules BEFORE running with
 * --commit, otherwise the new collection is still world-readable while it fills.
 */

const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const TRADE_FIELDS = ['offlineMRP', 'offlineDiscountPrice', 'offlinePrice'];
const COMMIT = process.argv.includes('--commit');

function loadCredentials() {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (fromEnv) return JSON.parse(fromEnv);

  const saPath = path.join(__dirname, '..', 'service-account.json');
  if (fs.existsSync(saPath)) return JSON.parse(fs.readFileSync(saPath, 'utf8'));

  throw new Error('Set FIREBASE_SERVICE_ACCOUNT_KEY or provide service-account.json');
}

async function main() {
  initializeApp({ credential: cert(loadCredentials()) });
  const db = getFirestore();

  const snapshot = await db.collection('products').get();
  console.log(`Scanned ${snapshot.size} products.\n`);

  const toMigrate = [];

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const pricing = {};
    let found = false;

    for (const field of TRADE_FIELDS) {
      if (data[field] !== undefined) {
        pricing[field] = data[field] === '' ? null : data[field];
        found = true;
      }
    }

    if (found) toMigrate.push({ id: docSnap.id, name: data.name || '(unnamed)', pricing });
  });

  if (toMigrate.length === 0) {
    console.log('Nothing to migrate — no product carries trade pricing fields.');
    return;
  }

  console.log(`${toMigrate.length} products carry trade pricing:\n`);
  for (const entry of toMigrate.slice(0, 10)) {
    console.log(`  ${entry.id}  ${entry.name.slice(0, 44).padEnd(44)} ${JSON.stringify(entry.pricing)}`);
  }
  if (toMigrate.length > 10) console.log(`  ... and ${toMigrate.length - 10} more`);

  if (!COMMIT) {
    console.log('\nDry run. Re-run with --commit to apply.');
    return;
  }

  // Firestore caps a batch at 500 operations and each product needs two.
  const CHUNK = 200;
  let done = 0;

  for (let i = 0; i < toMigrate.length; i += CHUNK) {
    const batch = db.batch();

    for (const entry of toMigrate.slice(i, i + CHUNK)) {
      batch.set(db.collection('productPricing').doc(entry.id), entry.pricing, { merge: true });

      const removals = {};
      for (const field of TRADE_FIELDS) removals[field] = FieldValue.delete();
      batch.update(db.collection('products').doc(entry.id), removals);
    }

    await batch.commit();
    done += Math.min(CHUNK, toMigrate.length - i);
    console.log(`  committed ${done}/${toMigrate.length}`);
  }

  console.log('\nDone. Trade pricing now lives in productPricing and is staff-read only.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error.message);
    process.exit(1);
  });
