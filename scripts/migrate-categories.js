const path = require('path');
const fs = require('fs');

/**
 * Migrate product categories to the nine approved store categories.
 *
 *   Old                              New
 *   -------------------------------- ------------------
 *   Rockets, Rockets & Novelties     Rockets
 *   Sparklers                        Sparkles
 *   Chakkars, Ground Crackers        Ground Chakkars
 *   Fancy, Fancy Fireworks           Fancy Fireworks
 *   Gift Boxes                       Gift Boxes
 *   Flower Pots                      Flower Pots
 *   Bombs                            Bombs
 *   Garlands                         Garlands
 *   Kids Special                     Kids Special
 *   Guns-Rolls                       Rockets
 *
 * Both `category` (primary) and `categories` (array) are rewritten. Run with
 * --dry-run to list every change without writing anything.
 */

const CATEGORY_MAP = {
  Rockets: 'Rockets',
  'Rockets & Novelties': 'Rockets',
  Sparklers: 'Sparkles',
  Sparkles: 'Sparkles',
  Chakkars: 'Ground Chakkars',
  'Ground Crackers': 'Ground Chakkars',
  'Ground Chakkars': 'Ground Chakkars',
  Fancy: 'Fancy Fireworks',
  'Fancy Fireworks': 'Fancy Fireworks',
  'Gift Boxes': 'Gift Boxes',
  'Flower Pots': 'Flower Pots',
  Bombs: 'Bombs',
  Garlands: 'Garlands',
  'Kids Special': 'Kids Special',
  'Guns-Rolls': 'Rockets',
};

const VALID = new Set(Object.values(CATEGORY_MAP));

async function main() {
  const dryRun = process.argv.includes('--dry-run');
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
  console.log(`products scanned: ${productsSnap.size}`);

  const batch = firestore.batch();
  let updates = 0;
  let unchanged = 0;
  const unmapped = new Set();

  for (const doc of productsSnap.docs) {
    const data = doc.data();
    const oldArray = Array.isArray(data.categories) ? data.categories : [];
    const oldPrimary = typeof data.category === 'string' ? data.category : '';

    const mapped = new Set();
    for (const name of oldArray.length ? oldArray : oldPrimary ? [oldPrimary] : []) {
      const trimmed = String(name).trim();
      const next = CATEGORY_MAP[trimmed];
      if (next) {
        mapped.add(next);
      } else {
        unmapped.add(trimmed);
      }
    }

    const newArray = [...mapped];
    const newPrimary = newArray[0] || '';

    const sameArray =
      newArray.length === oldArray.length &&
      newArray.every((c, i) => c === (oldArray[i] || ''));
    const samePrimary = newPrimary === oldPrimary;

    if (sameArray && samePrimary) {
      unchanged += 1;
      continue;
    }

    updates += 1;
    if (dryRun) {
      console.log(`[dry] ${doc.id} "${data.name}": ${oldPrimary || '-'} / [${oldArray.join(', ')}] -> ${newPrimary || '-'} / [${newArray.join(', ')}]`);
      continue;
    }

    const write = {};
    if (!samePrimary) write.category = newPrimary;
    if (!sameArray) write.categories = newArray;
    batch.update(doc.ref, write);
  }

  if (unmapped.size) {
    console.log(`UNMAPPED VALUES (${unmapped.size}): ${[...unmapped].join(' | ')}`);
  }

  if (!dryRun && updates > 0) {
    await batch.commit();
  }
  console.log(`updated: ${updates}, unchanged: ${unchanged}${dryRun ? ' (dry run, nothing written)' : ''}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});