'use strict';

/* ---------------------------------------------------------------------------
   End-to-end verification of the admin-driven homepage content:

   1. Rules: a public (unauthenticated) read of heroSlides/festiveDeals must
      succeed, and an unauthenticated write must be denied.
    2. Homepage write patterns: create, update (reorder/rename), disable and
       delete a hero slide and a festive deal exactly the way HomepageAdmin does,
      using the project service account (admin).
   3. Cleanup: every test document is removed.

   Usage:
     node scripts/verify-homepage-admin.js
   ------------------------------------------------------------------------- */

const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT_ID = 'standard-crackers-store';
const REST = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function publicRead(collection, id) {
  const res = await fetch(`${REST}/${collection}/${id}`, { method: 'GET' });
  return res.ok;
}

async function publicWrite(collection, id) {
  const res = await fetch(`${REST}/${collection}?documentId=${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { title: { stringValue: 'hack' } } }),
  });
  return res.status === 403;
}

async function main() {
  const saPath = path.join(__dirname, '..', 'service-account.json');
  if (!fs.existsSync(saPath)) {
    console.error('service-account.json not found in repo root — aborting');
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(saPath, 'utf8'))) });
  const db = getFirestore();

  const slideId = `verify-slide-${Date.now()}`;
  const dealId = `verify-deal-${Date.now()}`;

  try {
    /* --- Rules behaviour for the storefront-facing collections --- */
    check(
      'Unauthenticated write to heroSlides is denied (403)',
      await publicWrite('heroSlides', slideId)
    );
    check(
      'Unauthenticated write to festiveDeals is denied (403)',
      await publicWrite('festiveDeals', dealId)
    );

    /* --- Homepage-equivalent CRUD on heroSlides --- */
    const slideRef = db.collection('heroSlides').doc(slideId);
    await slideRef.set({
      id: slideId,
      imageUrl: '',
      eyebrow: 'Verification',
      heading: 'Verify Slide',
      subHeading: 'Temporary verification slide',
      ctaText: 'Shop',
      ctaLink: '/products',
      enabled: true,
      order: 0,
    });
    check('Admin can create a hero slide (setDoc)', true);

    await slideRef.update({ heading: 'Verify Slide Updated', order: 5 });
    check('Admin can update a hero slide (rename/reorder)', true);

    await slideRef.update({ enabled: false });
    check('Admin can disable a hero slide', true);

    check(
      'Public read of created hero slide succeeds',
      await publicRead('heroSlides', slideId)
    );

    /* --- Homepage-equivalent CRUD on festiveDeals --- */
    const dealRef = db.collection('festiveDeals').doc(dealId);
    await dealRef.set({
      id: dealId,
      icon: 'Gift',
      offerText: 'VERIFY',
      title: 'Verify Deal',
      description: 'Temporary verification deal',
      ctaText: 'Shop',
      ctaLink: '/products',
      gradientFrom: '#C33A14',
      gradientTo: '#DF4C21',
      enabled: true,
      order: 0,
    });
    check('Admin can create a festive deal (setDoc)', true);

    await dealRef.update({ title: 'Verify Deal Updated', enabled: false });
    check('Admin can update/disable a festive deal', true);

    check(
      'Public read of created festive deal succeeds',
      await publicRead('festiveDeals', dealId)
    );

    /* --- Cleanup --- */
    await slideRef.delete();
    await dealRef.delete();
    check('Test documents cleaned up', true);
  } catch (err) {
    check('Unexpected error during verification', false, err.message);
    try {
      await db.collection('heroSlides').doc(slideId).delete();
      await db.collection('festiveDeals').doc(dealId).delete();
    } catch { /* ignore */ }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});