const path = require('path');
const fs = require('fs');

async function main() {
  const { initializeApp, cert } = require('firebase-admin');
  const { getFirestore } = require('firebase-admin/firestore');
  const saPath = path.join(__dirname, '..', 'service-account.json');
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(saPath, 'utf8'))) });
  const firestore = getFirestore();
  const snap = await firestore.collection('products').get();
  let withOld = 0;
  for (const d of snap.docs) {
    const olds = d.data().oldSlugs;
    if (Array.isArray(olds) && olds.length) {
      withOld += 1;
      if (withOld <= 3) {
        console.log(`${d.id} | ${d.data().name} | slug=${d.data().slug} | oldSlugs=${JSON.stringify(olds)}`);
      }
    }
  }
  console.log('products with oldSlugs:', withOld);
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });