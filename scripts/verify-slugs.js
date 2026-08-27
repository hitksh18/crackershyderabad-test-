const path = require('path');
const fs = require('fs');

async function main() {
  const { initializeApp, cert } = require('firebase-admin');
  const { getFirestore } = require('firebase-admin/firestore');
  const saPath = path.join(__dirname, '..', 'service-account.json');
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(saPath, 'utf8'))) });
  const firestore = getFirestore();

  const snap = await firestore.collection('products').get();
  const seen = new Map();
  let dupes = 0;
  for (const d of snap.docs) {
    const slug = d.data().slug;
    if (!slug) { console.log('MISSING SLUG:', d.id, d.data().name); continue; }
    if (seen.has(slug)) {
      dupes += 1;
      console.log(`DUPE: ${slug}  (${seen.get(slug)} && ${d.id})`);
    } else {
      seen.set(slug, d.id);
    }
  }
  console.log(`products: ${snap.size}, duplicates: ${dupes}`);

  const ex = await firestore.collection('products').doc('BgIf8pl0ORUXBOuehckp').get();
  if (ex.exists) {
    console.log('EXAMPLE DOC BgIf8pl0ORUXBOuehckp:', ex.data().name, '=>', ex.data().slug);
  } else {
    console.log('EXAMPLE DOC NOT FOUND');
  }
  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });