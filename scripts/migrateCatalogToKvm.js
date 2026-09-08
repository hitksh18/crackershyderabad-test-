#!/usr/bin/env node
/**
 * Safe migration: COPY existing /images/catalog/* → KVM /products/, then update Firestore imageURL.
 *
 * Steps per product:
 *   1. COPY  source file → KVM dest
 *   2. VERIFY dest exists + size matches
 *   3. UPDATE Firestore imageURL to https://crackershyderabad.com/uploads/products/<filename>
 *   4. VERIFY again (read back + HTTPS HEAD if possible)
 *
 * Never deletes originals. Dry-run mode logs without writing.
 *
 * Usage:
 *   node scripts/migrateCatalogToKvm.js --dry-run
 *   node scripts/migrateCatalogToKvm.js --apply
 *
 * Env: MEDIA_ROOT defaults to /var/www/crackershyderabad-media
 *      SOURCE_CATALOG defaults to /var/www/crackershyderabad/images/catalog (prod) or client/public/images/catalog (dev)
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || !args.includes('--apply');
const VERBOSE = args.includes('--verbose');

const PUBLIC_BASE = process.env.MEDIA_PUBLIC_BASE || 'https://crackershyderabad.com/uploads';
const MEDIA_ROOT = process.env.MEDIA_ROOT || process.env.KVM_MEDIA_ROOT || (process.platform === 'win32' ? path.join(__dirname, '..', 'api', 'media') : '/var/www/crackershyderabad-media');
const DEST_DIR = path.join(MEDIA_ROOT, 'products');

const CANDIDATE_SOURCES = [
  process.env.SOURCE_CATALOG,
  '/var/www/crackershyderabad/images/catalog',
  path.join(__dirname, '..', 'client', 'public', 'images', 'catalog'),
  path.join(__dirname, '..', 'public', 'images', 'catalog'),
].filter(Boolean);

function findSourceDir() {
  for (const p of CANDIDATE_SOURCES) {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
  }
  return null;
}

function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
  } catch (_) {}
  try {
    const saPath = path.join(__dirname, '..', 'service-account.json');
    if (fs.existsSync(saPath) && !process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = fs.readFileSync(saPath, 'utf8');
    }
  } catch (_) {}
}

function isCatalogImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const t = url.trim();
  // Matches: /images/catalog/100.webp, images/catalog/100.webp, https://.../images/catalog/100.webp, or just 100.webp that exists in catalog
  if (t.includes('/images/catalog/')) return true;
  if (t.startsWith('/images/')) return true;
  // Bare filename that is in catalog (e.g. 100.webp) — treat as catalog if file exists
  if (/^\d+\.webp$/i.test(path.basename(t)) || /^[A-Za-z0-9_-]+\.(webp|jpg|png|gif)$/i.test(path.basename(t))) {
    // Only if it looks like a numbered catalog file without domain
    if (!t.includes('uploads/') && !t.includes('firebasestorage') && !t.startsWith('http')) {
      // Heuristic: if basename exists in source, caller will verify
      return true;
    }
  }
  return false;
}

function extractFilename(imageURL) {
  if (!imageURL) return null;
  let u = String(imageURL).trim();
  // Strip query/hash
  u = u.split('?')[0].split('#')[0];
  // Extract after last /
  const base = path.basename(u);
  // Decode
  try { return decodeURIComponent(base); } catch { return base; }
}

async function main() {
  loadEnvFile();
  const sourceDir = findSourceDir();
  console.log(`[migrate] MEDIA_ROOT=${MEDIA_ROOT}`);
  console.log(`[migrate] PUBLIC_BASE=${PUBLIC_BASE}`);
  console.log(`[migrate] DEST_DIR=${DEST_DIR}`);
  console.log(`[migrate] source catalog: ${sourceDir || '(NOT FOUND)'}`);
  console.log(`[migrate] mode: ${DRY_RUN ? 'DRY-RUN (no writes)' : 'APPLY'}`);

  if (!sourceDir) {
    console.error('[migrate] No source catalog directory found. Checked:', CANDIDATE_SOURCES);
    process.exit(1);
  }

  const catalogFiles = new Set(fs.readdirSync(sourceDir));
  console.log(`[migrate] catalog files: ${catalogFiles.size} in ${sourceDir}`);

  // Ensure dest exists (even in dry-run, check writability)
  if (!DRY_RUN) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
  }

  // Firebase init
  const { initializeApp, cert } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');

  let firestore;
  try {
    const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!saRaw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY missing');
    const parsed = JSON.parse(saRaw);
    initializeApp({ credential: cert(parsed) });
    firestore = getFirestore();
    console.log(`[migrate] Firestore project: ${parsed.project_id}`);
  } catch (e) {
    console.error('[migrate] Firebase init failed:', e.message);
    process.exit(1);
  }

  const snapshot = await firestore.collection('products').get();
  console.log(`[migrate] Firestore products: ${snapshot.size}`);

  let toMigrate = [];
  let alreadyKvm = 0;
  let skippedNoMatch = 0;
  let missingSource = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const id = docSnap.id;
    const imageURL = data.imageURL || data.imageUrl || data.image || '';
    if (!imageURL) {
      if (VERBOSE) console.log(`[skip] ${id} no imageURL`);
      skippedNoMatch++;
      continue;
    }
    if (String(imageURL).startsWith(PUBLIC_BASE + '/products/')) {
      alreadyKvm++;
      continue;
    }
    if (String(imageURL).includes('firebasestorage.googleapis.com')) {
      // Firebase URLs are not in catalog — skip for this catalog migration
      if (VERBOSE) console.log(`[skip] ${id} is firebase URL`);
      skippedNoMatch++;
      continue;
    }
    if (!isCatalogImageUrl(imageURL)) {
      if (VERBOSE) console.log(`[skip] ${id} not catalog pattern: ${imageURL}`);
      skippedNoMatch++;
      continue;
    }
    const filename = extractFilename(imageURL);
    if (!filename || !catalogFiles.has(filename)) {
      console.warn(`[warn] ${id} filename ${filename} not in catalog (imageURL=${imageURL})`);
      missingSource++;
      continue;
    }
    toMigrate.push({ id, data, filename, imageURL });
  }

  console.log(`[migrate] already KVM: ${alreadyKvm}, skipped: ${skippedNoMatch}, missing source: ${missingSource}, to migrate: ${toMigrate.length}`);

  if (toMigrate.length === 0) {
    console.log('[migrate] Nothing to migrate.');
    return;
  }

  let copied = 0, verified = 0, updated = 0, verify2 = 0, errors = 0;

  for (const item of toMigrate) {
    const src = path.join(sourceDir, item.filename);
    const dest = path.join(DEST_DIR, item.filename);
    const newUrl = `${PUBLIC_BASE}/products/${encodeURIComponent(item.filename)}`;

    // 1. COPY
    if (DRY_RUN) {
      console.log(`[dry-run] COPY ${item.filename} → ${dest} (product ${item.id}) → ${newUrl}`);
    } else {
      try {
        // If dest already exists, keep it (do not overwrite blindly)
        if (fs.existsSync(dest)) {
          const sStat = fs.statSync(src);
          const dStat = fs.statSync(dest);
          if (sStat.size === dStat.size) {
            console.log(`[copy] ${item.filename} already in KVM, skipping copy (size ${sStat.size})`);
          } else {
            // Backup existing?
            const alt = dest.replace(/(\.[a-z0-9]+)$/i, `_${Date.now()}$1`);
            console.log(`[copy] size mismatch for ${item.filename}, keeping existing and writing to ${path.basename(alt)}`);
            fs.copyFileSync(src, alt);
            copied++;
          }
        } else {
          fs.copyFileSync(src, dest);
          fs.chmodSync(dest, 0o644);
          copied++;
          console.log(`[copy] ${item.filename} → KVM`);
        }
      } catch (e) {
        console.error(`[error] copy failed for ${item.filename}:`, e.message);
        errors++;
        continue;
      }
    }

    // 2. VERIFY dest
    let destOk = false;
    if (DRY_RUN) {
      destOk = fs.existsSync(src); // dry-run just checks source
    } else {
      try {
        const sStat = fs.statSync(src);
        const dStat = fs.statSync(dest);
        destOk = fs.existsSync(dest) && sStat.size === dStat.size;
        if (destOk) {
          verified++;
          if (VERBOSE) console.log(`[verify] ${item.filename} size ${dStat.size} OK`);
        } else {
          console.error(`[error] verify size mismatch for ${item.filename}: src ${sStat.size} dest ${dStat.size}`);
          errors++;
          continue;
        }
      } catch (e) {
        console.error(`[error] verify failed for ${item.filename}:`, e.message);
        errors++;
        continue;
      }
    }

    // 3. UPDATE Firestore
    if (DRY_RUN) {
      console.log(`[dry-run] UPDATE ${item.id} imageURL: ${item.imageURL} → ${newUrl}`);
    } else {
      try {
        await firestore.collection('products').doc(item.id).update({ imageURL: newUrl });
        updated++;
        console.log(`[update] ${item.id} → ${newUrl}`);
      } catch (e) {
        console.error(`[error] Firestore update failed for ${item.id}:`, e.message);
        errors++;
        continue;
      }
    }

    // 4. VERIFY AGAIN (read back)
    if (!DRY_RUN) {
      try {
        const snap = await firestore.collection('products').doc(item.id).get();
        const after = snap.data()?.imageURL;
        if (after === newUrl) {
          verify2++;
        } else {
          console.error(`[error] verify2 mismatch for ${item.id}: expected ${newUrl} got ${after}`);
          errors++;
        }
      } catch (e) {
        console.error(`[error] verify2 read failed for ${item.id}:`, e.message);
        errors++;
      }
    }
  }

  console.log('\n[migrate] SUMMARY');
  console.log(`  toMigrate: ${toMigrate.length}`);
  console.log(`  copied: ${copied}`);
  console.log(`  verified: ${verified}`);
  console.log(`  updated: ${updated}`);
  console.log(`  verify2: ${verify2}`);
  console.log(`  errors: ${errors}`);
  console.log(`  dryRun: ${DRY_RUN}`);

  if (DRY_RUN) {
    console.log('\n[migrate] Dry-run complete. Re-run with --apply to execute.');
  } else {
    console.log('\n[migrate] Apply complete. Originals in source catalog were NOT deleted (safe).');
    console.log('[migrate] Verify on frontend: https://crackershyderabad.com/uploads/products/<filename> should return 200 via Nginx.');
  }
}

main().catch((e) => {
  console.error('[migrate] fatal:', e);
  process.exit(1);
});
