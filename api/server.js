const express = require('express');
const cors = require('cors');
// firebase-admin v14 removed the namespaced accessors from the default export
// in favour of these subpath modules. On this version `admin.auth()` is
// undefined and would throw at runtime.
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const sharp = require('sharp');

const {
  STAFF_ROLES,
  escapeHtml,
  sanitiseSmsText,
  createRateLimiter,
  securityHeaders,
} = require('./lib/security');
const { createOrder, createPosOrder, trackOrder, consumeNotifyToken, isValidEmail } = require('./lib/orders');
const { handleReverseGeocode, handleSearchPlaces, handleGeocodeConfig } = require('./lib/geocode');

try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
} catch (e) {
  console.warn('Could not load .env file:', e.message);
}

const app = express();

// Behind Replit/Hostinger proxies req.ip is only meaningful with this set,
// and the rate limiters key on it.
app.set('trust proxy', 1);
app.disable('x-powered-by');

/* ---------------------------------------------------------------------------
   CORS
   Wildcard suffix matching on *.web.app / *.firebaseapp.com used to allow any
   Firebase project on earth to make credentialed calls here — anyone can create
   one. Origins are now an explicit allow-list driven by configuration.
   --------------------------------------------------------------------------- */

const DEFAULT_ORIGINS = [
  'http://localhost:5000',
  'http://localhost:3000',
  'https://crackershyderabad.com',
  'https://www.crackershyderabad.com',
];

const ALLOWED_ORIGINS = [
  ...DEFAULT_ORIGINS,
  ...(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
];

const corsOptions = {
  origin(origin, callback) {
    // Same-origin and non-browser callers send no Origin header. They are still
    // subject to authentication on every route that matters.
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);

    console.warn(`[cors] blocked origin: ${origin}`);
    return callback(new Error('CORS not allowed'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(express.json({ limit: '256kb' }));

/* ---------------------------------------------------------------------------
   Rate limits
   --------------------------------------------------------------------------- */

const adminLimiter = createRateLimiter({ windowMs: 60_000, max: 60, name: 'admin' });
const uploadLimiter = createRateLimiter({ windowMs: 60_000, max: 20, name: 'upload' });
const notifyLimiter = createRateLimiter({ windowMs: 60_000, max: 10, name: 'notify' });

/* ---------------------------------------------------------------------------
   Firebase Admin
   --------------------------------------------------------------------------- */

let firebaseInitialized = false;

function initializeFirebase() {
  if (firebaseInitialized) return true;

  try {
    let serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (!serviceAccount) {
      const saPath = path.join(__dirname, '..', 'service-account.json');
      if (fs.existsSync(saPath)) {
        serviceAccount = fs.readFileSync(saPath, 'utf8');
      }
    }

    if (!serviceAccount) {
      console.error('FIREBASE_SERVICE_ACCOUNT_KEY not found in environment or service-account.json');
      return false;
    }

    initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
    firebaseInitialized = true;
    console.log('Firebase Admin SDK initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK:', error.message);
    return false;
  }
}

initializeFirebase();

const requireFirebase = (req, res, next) => {
  if (!firebaseInitialized) {
    return res.status(503).json({
      error: 'Firebase Admin SDK not initialized. Please add FIREBASE_SERVICE_ACCOUNT_KEY secret.',
      setupRequired: true,
    });
  }
  return next();
};

/**
 * Verify the caller's Firebase ID token and resolve their role.
 *
 * This is the control that was missing entirely: every /api/admin route was
 * previously gated only on "is the SDK initialized", which meant an
 * unauthenticated request could list every user and mint a password-reset link
 * for any account — including the owner's.
 */
async function authenticate(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  try {
    // checkRevoked: a disabled or signed-out account must stop working at once.
    const decoded = await getAuth().verifyIdToken(match[1].trim(), true);

    let role = null;
    try {
      const snap = await getFirestore().collection('roles').doc(decoded.uid).get();
      if (snap.exists) role = snap.data().role || null;
    } catch (error) {
      console.error('Role lookup failed:', error.message);
    }

    return { uid: decoded.uid, email: decoded.email || null, role };
  } catch (error) {
    console.warn('Token verification failed:', error.message);
    return null;
  }
}

const requireRole = (allowed) => async (req, res, next) => {
  if (!firebaseInitialized) {
    return res.status(503).json({ error: 'Service unavailable', setupRequired: true });
  }

  const caller = await authenticate(req);
  if (!caller) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!allowed.includes(caller.role)) {
    console.warn(`[authz] ${caller.uid} (${caller.role || 'no role'}) denied ${req.method} ${req.path}`);
    return res.status(403).json({ error: 'You do not have permission to perform this action' });
  }

  req.caller = caller;
  return next();
};

const requireAdmin = requireRole(['admin']);

/* ---------------------------------------------------------------------------
   Uploads
   Serverless-friendly: files are held in memory, processed with sharp and
   persisted to Firebase Storage (products/<name>, public read). Local disk
   is ephemeral on Vercel, so nothing is ever written to the filesystem.
   --------------------------------------------------------------------------- */

// The stored extension is chosen from this map, never taken from the upload.
// A client-supplied name like "payload.html" with a spoofed image/* MIME type
// would otherwise be written verbatim and then served back from /uploads as
// active content on this origin.
const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1, fields: 10 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES[file.mimetype]) return cb(null, true);
    return cb(new Error('Only JPEG, PNG, WebP or GIF images are allowed'));
  },
});

function storageBucket(projectId) {
  const configured = process.env.STORAGE_BUCKET;
  if (configured) return configured;
  const defaultName = `${projectId || 'standard-crackers-store'}.firebasestorage.app`;
  return defaultName;
}

async function storeImage(buffer, name, contentType) {
  if (!firebaseInitialized) throw new Error('Firebase is not initialized');
  const bucket = getStorage().bucket(storageBucket(process.env.FIREBASE_PROJECT_ID));
  const file = bucket.file(`products/${name}`);
  await file.save(buffer, {
    metadata: {
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });
  await file.makePublic();
  const bucketName = file.bucket.name;
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(`products/${name}`)}?alt=media`;
}

/* ---------------------------------------------------------------------------
   Disk fallback for uploads.
   Firebase Storage may not be provisioned on the project (no billing bucket
   exists). When the bucket write fails, images are kept on the server disk in
   the persistent api directory (deploys only copy into it, never wipe it) and
   served back over the same /api origin.
   --------------------------------------------------------------------------- */

const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const UPLOAD_CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

async function storeImageToDisk(buffer, name) {
  await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.promises.writeFile(path.join(UPLOADS_DIR, name), buffer);
}

app.get('/api/images/:name', (req, res) => {
  const name = req.params.name;
  if (!/^[A-Za-z0-9_-]+\.(jpg|png|webp|gif)$/.test(name)) {
    return res.status(404).json({ error: 'Not found' });
  }
  const filePath = path.join(UPLOADS_DIR, name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.set('Content-Type', UPLOAD_CONTENT_TYPES[path.extname(name).toLowerCase()] || 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  return res.sendFile(filePath);
});

app.post(
  '/api/upload',
  uploadLimiter,
  requireAdmin,
  upload.single('image'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // The MIME type is client-supplied. Decode the file and let sharp tell us
    // what it actually is before we keep it.
    try {
      const meta = await sharp(req.file.buffer).metadata();
      if (!meta.format || !['jpeg', 'png', 'webp', 'gif'].includes(meta.format)) {
        throw new Error(`Unsupported image content: ${meta.format || 'unknown'}`);
      }
    } catch (error) {
      console.warn('Rejected upload that is not a real image:', error.message);
      return res.status(400).json({ error: 'That file is not a valid image' });
    }

    const ext = ALLOWED_IMAGE_TYPES[req.file.mimetype] || '.bin';
    const shouldUpscale = req.body.upscale === 'true';
    const shouldWatermark = req.body.watermark !== 'false';

    let buffer = req.file.buffer;
    let finalName = `${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`;

    try {
      if (shouldUpscale) {
        const result = await upscaleImage(buffer, finalName);
        buffer = result.buffer;
        finalName = result.name;
      }
      if (shouldWatermark) {
        const marked = await watermarkImage(buffer);
        if (marked !== false) buffer = marked;
      }
    } catch (error) {
      console.error('Image processing failed, keeping original:', error.message);
    }

    try {
      const url = await storeImage(buffer, finalName, req.file.mimetype);
      return res.json({ url });
    } catch (error) {
      console.error('Storage upload failed, falling back to local disk:', error.message);
      try {
        await storeImageToDisk(buffer, finalName);
        const url = `${req.protocol}://${req.get('host')}/api/images/${encodeURIComponent(finalName)}`;
        return res.json({ url });
      } catch (diskError) {
        console.error('Disk upload failed:', diskError.message);
        return res.status(500).json({ error: 'Failed to store image' });
      }
    }
  }
);

const WATERMARK_LABEL = 'Crackers Hyderabad';

async function watermarkImage(buffer) {
  const meta = await sharp(buffer).metadata();
  const width = meta.width || 800;
  const height = meta.height || 600;

  if (width < 160 || height < 120) return false;

  const fontSize = Math.max(13, Math.round(Math.min(width, height) * 0.032));
  const approxTextWidth = WATERMARK_LABEL.length * fontSize * 0.62;
  const pad = Math.round(fontSize * 0.55);
  const pillW = Math.round(approxTextWidth + pad * 2);
  const pillH = Math.round(fontSize * 1.65);
  const margin = Math.max(8, Math.round(fontSize * 0.55));
  const x = Math.max(0, width - pillW - margin);
  const y = Math.max(0, height - pillH - margin);

  const svg = Buffer.from(
    `<svg width="${pillW}" height="${pillH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${pillW}" height="${pillH}" rx="${Math.round(pillH / 2)}" fill="rgba(0,0,0,0.45)"/>
      <text x="${pillW / 2}" y="${pillH / 2 + 1}" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="rgba(255,255,255,0.92)" text-anchor="middle" dominant-baseline="central">${WATERMARK_LABEL}</text>
    </svg>`
  );

  let pipeline = sharp(buffer).composite([{ input: svg, top: y, left: x }]);
  if (meta.format === 'png') {
    pipeline = pipeline.png({ compressionLevel: 9 });
  } else if (meta.format === 'webp') {
    pipeline = pipeline.webp({ quality: 92 });
  } else if (meta.format === 'gif') {
    return false;
  } else {
    pipeline = pipeline.jpeg({ quality: 92 });
  }

  return pipeline.toBuffer();
}

const UPSCALE_TARGET = 1600;
const UPSCALE_MAX_FACTOR = 4;

async function upscaleImage(buffer, filename) {
  const meta = await sharp(buffer).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  const maxDim = Math.max(width, height);

  const scale = maxDim >= UPSCALE_TARGET ? 1 : Math.min(UPSCALE_TARGET / maxDim, UPSCALE_MAX_FACTOR);

  let newName = `${path.basename(filename, path.extname(filename))}.png`;
  if (newName === filename) {
    newName = `${path.basename(filename, path.extname(filename))}_up${Date.now()}.png`;
  }

  const processed = await sharp(buffer)
    .resize({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return { buffer: processed, name: newName };
}

/* ---------------------------------------------------------------------------
   Admin user management — all admin-only, all rate limited
   --------------------------------------------------------------------------- */

const toUserPayload = (userRecord) => ({
  uid: userRecord.uid,
  email: userRecord.email || null,
  displayName: userRecord.displayName || null,
  photoURL: userRecord.photoURL || null,
  phoneNumber: userRecord.phoneNumber || null,
  emailVerified: userRecord.emailVerified,
  disabled: userRecord.disabled,
  providers: (userRecord.providerData || []).map((p) => p.providerId),
  creationTime: userRecord.metadata.creationTime,
  lastSignInTime: userRecord.metadata.lastSignInTime,
  lastRefreshTime: userRecord.metadata.lastRefreshTime || null,
});

app.get('/api/admin/users', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const users = [];
    let nextPageToken;

    do {
      const result = await getAuth().listUsers(1000, nextPageToken);
      result.users.forEach((u) => users.push(toUserPayload(u)));
      nextPageToken = result.pageToken;
    } while (nextPageToken);

    res.json({ users, total: users.length });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

app.get('/api/admin/users/:uid', adminLimiter, requireAdmin, async (req, res) => {
  try {
    res.json(toUserPayload(await getAuth().getUser(req.params.uid)));
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(404).json({ error: 'User not found' });
  }
});

app.post('/api/admin/users/:uid/reset-password', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const userRecord = await getAuth().getUser(req.params.uid);

    if (!userRecord.email) {
      return res.status(400).json({ error: 'User does not have an email address' });
    }

    // The link is a bearer credential for that account. It is generated and
    // delivered to the account's own inbox; it is never returned to the caller,
    // which is what previously turned this endpoint into account takeover.
    const link = await getAuth().generatePasswordResetLink(userRecord.email);

    if (checkEmailConfig()) {
      await getEmailTransporter().sendMail({
        from: `"Crackers Hyderabad" <${process.env.EMAIL_USER}>`,
        to: userRecord.email,
        subject: 'Reset your Crackers Hyderabad password',
        html: `<p>Hello,</p>
               <p>An administrator has started a password reset for your account.
               Use the link below within the next hour:</p>
               <p><a href="${escapeHtml(link)}">Reset your password</a></p>
               <p>If you did not expect this, you can ignore this email — your
               current password will keep working.</p>`,
      });

      console.log(`[admin] ${req.caller.uid} sent a password reset to ${userRecord.uid}`);
      return res.json({ success: true, message: `Reset link emailed to ${userRecord.email}`, email: userRecord.email });
    }

    console.warn('[admin] password reset generated but email is not configured');
    return res.status(503).json({
      error: 'Email service is not configured, so the reset link could not be delivered.',
      setupRequired: true,
    });
  } catch (error) {
    console.error('Error generating password reset:', error);
    return res.status(500).json({ error: 'Failed to send password reset' });
  }
});

app.post('/api/admin/users/:uid/disable', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const disabled = req.body?.disabled === true;

    if (req.params.uid === req.caller.uid && disabled) {
      return res.status(400).json({ error: 'You cannot disable your own account' });
    }

    await getAuth().updateUser(req.params.uid, { disabled });
    console.log(`[admin] ${req.caller.uid} set disabled=${disabled} on ${req.params.uid}`);
    res.json({ success: true, message: disabled ? 'User account disabled' : 'User account enabled', disabled });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

app.delete('/api/admin/users/:uid', adminLimiter, requireAdmin, async (req, res) => {
  try {
    if (req.params.uid === req.caller.uid) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    await getAuth().deleteUser(req.params.uid);
    console.log(`[admin] ${req.caller.uid} deleted ${req.params.uid}`);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.post('/api/admin/users/:uid/update', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const { displayName, email, emailVerified, photoURL } = req.body || {};
    const updateData = {};

    if (typeof displayName === 'string') updateData.displayName = displayName.slice(0, 120);
    if (typeof email === 'string') updateData.email = email.slice(0, 254);
    if (typeof emailVerified === 'boolean') updateData.emailVerified = emailVerified;
    if (typeof photoURL === 'string' && /^https:\/\//i.test(photoURL)) updateData.photoURL = photoURL;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await getAuth().updateUser(req.params.uid, updateData);
    console.log(`[admin] ${req.caller.uid} updated ${req.params.uid}`);
    res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

/* ---------------------------------------------------------------------------
   Recommendations + analytics engine
   Public surfaces (events, home, search, similar, cart, recent, category,
   trending) are rate-limited but unauthenticated — they operate on
   sessionId/userId passed by the storefront. Admin surfaces (analytics,
   config) require an admin role.
   --------------------------------------------------------------------------- */

const rec = require('./lib/recommendation');

const eventLimiter = createRateLimiter({ windowMs: 60_000, max: 120, name: 'events' });
const recLimiter = createRateLimiter({ windowMs: 60_000, max: 120, name: 'rec' });

const withDb = (handler) => (req, res) => {
  req.firestore = getFirestore();
  return handler(req, res);
};

app.post('/api/events', requireFirebase, eventLimiter, withDb(async (req, res) => {
  // Optional auth: bind attribution to the verified caller so a client cannot
  // POST events under another account's userId (which would corrupt that
  // account's learned preference vector). Guests remain session-scoped.
  req.caller = await authenticate(req);
  return rec.handleRecordEvent(req, res);
}));
app.post('/api/recommendations/events', requireFirebase, eventLimiter, withDb(rec.handleRecEvent));

app.get('/api/recommendations/home', requireFirebase, recLimiter, withDb(rec.handleHome));
app.get('/api/recommendations/search', requireFirebase, recLimiter, withDb(rec.handleSearch));
app.get('/api/recommendations/similar/:productId', requireFirebase, recLimiter, withDb(rec.handleSimilar));
app.post('/api/recommendations/cart', requireFirebase, recLimiter, withDb(rec.handleCart));
app.get('/api/recommendations/recent', requireFirebase, recLimiter, withDb(rec.handleRecent));
app.get('/api/recommendations/category/:category', requireFirebase, recLimiter, withDb(rec.handleCategory));
app.get('/api/trending', requireFirebase, recLimiter, withDb(rec.handleTrending));

app.get('/api/admin/recommendations/analytics', requireFirebase, requireAdmin, adminLimiter, withDb(rec.handleAnalytics));
app.get('/api/admin/recommendations/config', requireFirebase, requireAdmin, adminLimiter, withDb(rec.handleGetConfig));
app.put('/api/admin/recommendations/config', requireFirebase, requireAdmin, adminLimiter, withDb(rec.handlePutConfig));

/* ---------------------------------------------------------------------------
   Site analytics (first-party)
   Ingestion is public — a visitor is not signed in — but it is rate limited
   and stores no IP address. Reading is admin-only: traffic, referrers and
   revenue are business data, so these two routes carry the same guard chain
   as every other /api/admin surface.
   --------------------------------------------------------------------------- */

const site = require('./lib/siteAnalytics');

// A generous ceiling: every SPA navigation posts one pageview, so a customer
// browsing quickly is normal traffic, not abuse. Still bounded per IP.
const siteLimiter = createRateLimiter({ windowMs: 60_000, max: 240, name: 'site' });

const safeSite = async (handler, res) => {
  try {
    const result = await handler();
    if (result && result.error) return res.status(400).json(result);
    return res.json(result);
  } catch (error) {
    console.error('[site] handler failed:', error.message);
    return res.status(500).json({ error: 'Analytics service error' });
  }
};

app.post('/api/site/pageview', requireFirebase, siteLimiter, withDb((req, res) =>
  /* The request is forwarded whole so geography can be resolved from the
     caller's address on a session's first hit. That address is used and
     discarded inside lib/geo — only the country, state and city it resolves to
     are ever stored. Edge geo headers, where a real edge sets them, win. */
  safeSite(() => site.recordPageview(req.firestore, req.body, req), res)));

app.post('/api/site/funnel', requireFirebase, siteLimiter, withDb((req, res) =>
  safeSite(() => site.recordFunnelStage(req.firestore, req.body), res)));

app.get('/api/admin/analytics/site', requireFirebase, requireAdmin, adminLimiter, withDb((req, res) =>
  safeSite(
    () =>
      site.siteSnapshot(req.firestore, {
        days: req.query.days,
        from: req.query.from,
        to: req.query.to,
      }),
    res,
  )));

app.get('/api/admin/analytics/live', requireFirebase, requireAdmin, adminLimiter, withDb((req, res) =>
  safeSite(() => site.liveVisitors(req.firestore), res)));

/* ---------------------------------------------------------------------------
   Deploy endpoint (Hostinger only)
   The auto-deploy pipeline uploads a tarball over HTTPS instead of SSH, so
   GitHub runner IPs never need to reach port 22. The token lives only in the
   server file system; this route does not exist when it is absent.
   --------------------------------------------------------------------------- */

const DEPLOY_TOKEN =
  process.env.DEPLOY_TOKEN ||
  (() => {
    const tokenPath = '/root/crackers-deploy/.deploy-token';
    if (!fs.existsSync(tokenPath)) return '';
    return fs.readFileSync(tokenPath, 'utf8').trim();
  })();

const deployLimiter = createRateLimiter({ windowMs: 60_000, max: 10, name: 'deploy' });

app.post(
  '/api/deploy',
  deployLimiter,
  express.raw({ type: 'application/gzip', limit: '64mb' }),
  async (req, res) => {
    if (!DEPLOY_TOKEN) return res.status(404).json({ error: 'Not found' });

    const provided = String(req.get('x-deploy-token') || '');
    const a = Buffer.from(provided);
    const b = Buffer.from(DEPLOY_TOKEN);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Invalid deploy token' });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'Missing tarball body' });
    }

    try {
      fs.writeFileSync('/root/deploy-latest.tar.gz', req.body);
      const { stdout, stderr } = await execFile('bash', ['/root/crackers-deploy/deploy.sh'], {
        timeout: 300_000,
        maxBuffer: 8 * 1024 * 1024,
      });
      res.json({ ok: true, output: `${stdout}\n${stderr}`.trim() });
    } catch (error) {
      console.error('[deploy] failed:', error.message);
      res.status(500).json({ ok: false, error: error.message });
    }
  }
);

/* ---------------------------------------------------------------------------
   Order notifications
   Content is always read from Firestore, never from the request body. The old
   endpoints accepted a whole order object and a free-text recipient, which made
   them an open relay for mail and SMS sent from the shop's own identity.
   --------------------------------------------------------------------------- */

let emailConfigured = false;

function checkEmailConfig() {
  if (emailConfigured) return true;
  emailConfigured = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
  return emailConfigured;
}

function getEmailTransporter() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: process.env.EMAIL_PORT === '465',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

async function loadOrderRef(orderId) {
  if (typeof orderId !== 'string' || !orderId || orderId.length > 128) return null;
  const ref = getFirestore().collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { ref, order: { id: snap.id, ...snap.data() } };
}

/**
 * Decide whether this caller may make the shop send a message about this order.
 *
 * "The order exists and is recent" is NOT proof of anything: order creation used
 * to be open, so an attacker could plant a document and then have it mailed to a
 * victim from the shop's own authenticated SMTP session. Authorisation is now
 * either a single-use token handed to whoever actually placed the order, or a
 * verified staff identity.
 */
async function authoriseNotification(req, entry, channel) {
  const caller = await authenticate(req);
  if (caller && STAFF_ROLES.includes(caller.role)) return true;

  return consumeNotifyToken(
    getFirestore(),
    entry.ref,
    entry.order,
    req.body?.notifyToken,
    channel
  );
}

const formatINR = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

// Each rendered row is ~500 bytes of markup and a Firestore document may hold
// tens of thousands of array elements, so an uncapped render is a ~40x
// amplification into a single multi-megabyte string.
const MAX_EMAIL_ROWS = 200;

function buildOrderEmailHtml(order) {
  const allItems = Array.isArray(order.items) ? order.items : [];
  const items = allItems.slice(0, MAX_EMAIL_ROWS);
  const omitted = allItems.length - items.length;
  const rows = items
    .map((item, index) => {
      const price = item.discountPrice || item.onlinePrice || item.price || 0;
      const total = price * item.quantity;
      return `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #eee;color:#333;">${index + 1}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;color:#333;">${escapeHtml(item.name || 'N/A')}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;color:#333;text-align:center;">${escapeHtml(item.quantity)}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;color:#333;text-align:right;">${formatINR(price)}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;color:#333;text-align:right;font-weight:600;">${formatINR(total)}</td>
      </tr>`;
    })
    .join('');

  const cust = order.customer || {};
  const displayOrderId = escapeHtml(
    String(order.shortCode || order.orderId || order.id || 'N/A').toUpperCase()
  );
  const orderDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const address = [cust.address, cust.city, cust.pincode].filter(Boolean).join(', ');

  return `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#f7f3ec;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f3ec;padding:24px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
              <tr>
                <td style="background:linear-gradient(135deg,#761713,#94251F);padding:28px 32px;text-align:center;">
                  <h1 style="margin:0;color:#ffffff;font-size:26px;">CRACKERS HYDERABAD</h1>
                  <p style="margin:6px 0 0;color:#D2A64F;font-size:13px;">Standard Fireworks Exclusive Store</p>
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">
                  <h2 style="margin:0 0 6px;color:#761713;font-size:20px;">Order Confirmed</h2>
                  <p style="margin:0 0 20px;color:#666;font-size:14px;">Thank you for shopping with us, <strong>${escapeHtml(cust.name || 'Valued Customer')}</strong>. Here are your order details:</p>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f2;border:1px solid #eee;border-radius:8px;margin-bottom:24px;">
                    <tr>
                      <td style="padding:12px 16px;width:50%;color:#888;font-size:12px;text-transform:uppercase;">Order ID</td>
                      <td style="padding:12px 16px;color:#761713;font-size:14px;font-weight:bold;">#${displayOrderId}</td>
                    </tr>
                    <tr>
                      <td style="padding:12px 16px;border-top:1px solid #eee;color:#888;font-size:12px;text-transform:uppercase;">Date</td>
                      <td style="padding:12px 16px;border-top:1px solid #eee;color:#333;font-size:14px;">${escapeHtml(orderDate)}</td>
                    </tr>
                    <tr>
                      <td style="padding:12px 16px;border-top:1px solid #eee;color:#888;font-size:12px;text-transform:uppercase;">Payment</td>
                      <td style="padding:12px 16px;border-top:1px solid #eee;color:#333;font-size:14px;">${escapeHtml(order.paymentMode || order.paymentStatus || 'Cash on Delivery')}</td>
                    </tr>
                    <tr>
                      <td style="padding:12px 16px;border-top:1px solid #eee;color:#888;font-size:12px;text-transform:uppercase;">Delivery Address</td>
                      <td style="padding:12px 16px;border-top:1px solid #eee;color:#333;font-size:14px;">${escapeHtml(address || 'N/A')}</td>
                    </tr>
                    <tr>
                      <td style="padding:12px 16px;border-top:1px solid #eee;color:#888;font-size:12px;text-transform:uppercase;">Phone</td>
                      <td style="padding:12px 16px;border-top:1px solid #eee;color:#333;font-size:14px;">${escapeHtml(cust.phone || 'N/A')}</td>
                    </tr>
                  </table>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
                    <tr style="background:#761713;">
                      <td style="padding:10px;color:#ffffff;font-size:12px;font-weight:bold;">S.No</td>
                      <td style="padding:10px;color:#ffffff;font-size:12px;font-weight:bold;">Item</td>
                      <td style="padding:10px;color:#ffffff;font-size:12px;font-weight:bold;text-align:center;">Qty</td>
                      <td style="padding:10px;color:#ffffff;font-size:12px;font-weight:bold;text-align:right;">Price</td>
                      <td style="padding:10px;color:#ffffff;font-size:12px;font-weight:bold;text-align:right;">Total</td>
                    </tr>
                    ${rows || '<tr><td colspan="5" style="padding:10px;color:#999;text-align:center;">No items</td></tr>'}
                    ${omitted > 0 ? `<tr><td colspan="5" style="padding:10px;color:#999;text-align:center;">and ${omitted} more item${omitted === 1 ? '' : 's'}</td></tr>` : ''}
                    <tr>
                      <td colspan="4" style="padding:12px 10px;text-align:right;color:#333;font-size:14px;"><strong>GRAND TOTAL</strong></td>
                      <td style="padding:12px 10px;text-align:right;color:#761713;font-size:16px;font-weight:bold;">${formatINR(order.total)}</td>
                    </tr>
                  </table>

                  <p style="margin:0 0 8px;color:#333;font-size:14px;"><strong>Note:</strong> Payment is collected on delivery. Please keep the order ID handy for tracking.</p>
                  <p style="margin:0;color:#888;font-size:12px;">Track your order status anytime in <strong>My Orders</strong> on our website.</p>
                </td>
              </tr>
              <tr>
                <td style="background:#faf7f2;border-top:1px solid #eee;padding:20px 32px;text-align:center;">
                  <p style="margin:0 0 4px;color:#333;font-size:13px;"><strong>Have questions?</strong> Contact us on WhatsApp or visit our store.</p>
                  <p style="margin:0;color:#888;font-size:12px;">Crackers Hyderabad, Hyderabad, Telangana | www.crackershyderabad.com</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;
}

/**
 * Order placement. Open to guests by design — this is checkout — but every
 * price, the total, the status and the order code are decided server-side from
 * the products collection, and `orders.create` is closed in the rules so this
 * is the only way an order can come into existence.
 *
 * A signed-in caller is bound to their order via the optional bearer token.
 */
const orderLimiter = createRateLimiter({ windowMs: 60_000, max: 12, name: 'orders' });

app.post('/api/orders', orderLimiter, requireFirebase, async (req, res) => {
  req.caller = await authenticate(req); // null for guests, which is allowed
  return createOrder(req, res);
});

/**
 * Reverse geocoding for the checkout map pin.
 *
 * Open to guests for the same reason /api/orders is — the people using it have
 * not signed in. The limit is set by what one honest customer does: nudging a
 * pin around a courtyard is a handful of lookups, and the module caches by an
 * ~11 m grid on top of that, so 30 a minute is generous for a checkout and
 * still far below the courtesy rate Nominatim asks visitors to respect.
 *
 * No requireFirebase: this touches no Firestore, and a database outage should
 * not take the address lookup with it.
 */
const geoLimiter = createRateLimiter({ windowMs: 60_000, max: 30, name: 'geocode' });

app.get('/api/geocode/reverse', geoLimiter, handleReverseGeocode);
/* Place search runs only when the customer submits the box — never per
   keystroke — which keeps this inside Nominatim's one-request-a-second
   courtesy limit without needing a separate budget. */
app.get('/api/geocode/search', geoLimiter, handleSearchPlaces);

// Which provider is live, for the admin settings screen. Never the key itself.
app.get('/api/geocode/config', geoLimiter, requireAdmin, handleGeocodeConfig);

// Counter billing (staff only). Same pricing discipline as /api/orders, but
// prices from the staff-only productPricing collection and records the payment
// mode, discount and a Completed status on a walk-in sale. `orders.create` is
// closed in the rules, so this endpoint is the only way a counter bill exists.
app.post(
  '/api/orders/pos',
  orderLimiter,
  requireFirebase,
  requireRole(['admin', 'sales']),
  createPosOrder
);

/**
 * Public order tracking.
 *
 * This endpoint exists because tracking codes are sequential (CH1001, CH1002)
 * and therefore guessable. `trackingCodes.get` is staff-only in the rules, so
 * this is the only public route from a code to an order, and it requires the
 * last four digits of the order's phone number. Staff, holding a verified
 * token, look up by code alone.
 *
 * The limit is per IP and sits on top of the per-code lockout in lib/orders.js.
 * 20 a minute is far more than a customer checking a delivery needs, and the
 * per-code counter is what actually bounds guessing.
 */
const trackLimiter = createRateLimiter({ windowMs: 60_000, max: 20, name: 'track' });

app.post('/api/orders/track', trackLimiter, requireFirebase, async (req, res) => {
  req.caller = await authenticate(req); // null for guests, who must supply the digits
  return trackOrder(req, res);
});

app.post('/api/orders/email', notifyLimiter, requireFirebase, async (req, res) => {
  try {
    const entry = await loadOrderRef(req.body?.orderId);
    if (!entry) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!(await authoriseNotification(req, entry, 'email'))) {
      return res.status(403).json({ error: 'Not permitted for this order' });
    }

    const { order } = entry;

    // The recipient comes from the stored order — and must still be exactly one
    // well-formed address. Nodemailer parses `to` as an address *list*, so an
    // unvalidated value containing commas would fan a single send out to many
    // recipients.
    const customerEmail = order.customer?.email || order.userEmail;
    if (!isValidEmail(customerEmail)) {
      return res.status(400).json({ error: 'This order has no usable email address' });
    }

    if (!checkEmailConfig()) {
      return res.status(503).json({
        error: 'Email service not configured. Add EMAIL_HOST, EMAIL_USER and EMAIL_PASS to the server environment.',
        setupRequired: true,
      });
    }

    const displayOrderId = String(order.shortCode || order.id).toUpperCase();

    const info = await getEmailTransporter().sendMail({
      from: `"Crackers Hyderabad" <${process.env.EMAIL_USER}>`,
      // Structured single recipient: nodemailer cannot expand this into a list.
      to: [{ address: customerEmail, name: '' }],
      subject: `Order Confirmed - #${displayOrderId} | Crackers Hyderabad`,
      html: buildOrderEmailHtml(order),
    });

    console.log(`Order email sent for ${order.id} (messageId: ${info.messageId})`);
    res.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('Error sending order email:', error);
    res.status(500).json({ error: 'Failed to send order email' });
  }
});

app.post('/api/orders/sms', notifyLimiter, requireFirebase, async (req, res) => {
  try {
    const authKey = process.env.MSG91_AUTH_KEY;
    if (!authKey) {
      return res.status(200).json({
        success: false,
        setupRequired: true,
        error: 'SMS service not configured. Add MSG91_AUTH_KEY to the server environment.',
      });
    }

    const entry = await loadOrderRef(req.body?.orderId);
    if (!entry) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!(await authoriseNotification(req, entry, 'sms'))) {
      return res.status(403).json({ error: 'Not permitted for this order' });
    }

    const { order } = entry;

    // Recipient and message content both come from the stored order.
    const rawPhone = order.customer?.phone || order.userPhone;
    if (!rawPhone) {
      return res.status(400).json({ error: 'This order has no phone number' });
    }

    const digits = String(rawPhone).replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 12) {
      return res.status(400).json({ error: 'This order has an unusable phone number' });
    }
    const mobile = digits.startsWith('91') ? digits : `91${digits}`;

    const type = req.body?.type === 'status' ? 'status' : 'placed';
    const customerName = sanitiseSmsText(order.customer?.name || 'Customer', 40);
    const code = sanitiseSmsText(order.shortCode || order.id, 24);

    const message =
      type === 'status'
        ? `Dear ${customerName}, your order #${code} is now ${sanitiseSmsText(order.status || 'updated', 24)}. Thank you for shopping with Crackers Hyderabad!`
        : `Dear ${customerName}, your order #${code} (Rs.${Number(order.total || 0)}) has been placed successfully. We will update you on its status. - Crackers Hyderabad`;

    const params = new URLSearchParams({
      authkey: authKey,
      mobiles: mobile,
      message,
      sender: process.env.MSG91_SENDER_ID || 'CRAKER',
      route: process.env.MSG91_ROUTE || '4',
      country: '91',
    });

    const response = await fetch(`https://api.msg91.com/api/sendhttp.php?${params.toString()}`);
    const text = await response.text();
    // Log the outcome, not the provider payload, which can echo the auth key.
    console.log(`[SMS] ${type} for order ${order.id}: ${response.ok ? 'sent' : 'provider error'}`);
    res.json({ success: text.includes('type:success') });
  } catch (error) {
    console.error('Error sending SMS:', error);
    res.status(500).json({ success: false, error: 'Failed to send SMS' });
  }
});

/* ---------------------------------------------------------------------------
   Errors
   --------------------------------------------------------------------------- */

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5MB or smaller' : 'Upload failed';
    return res.status(400).json({ error: message });
  }

  if (err && /CORS not allowed/.test(err.message || '')) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  if (err) {
    console.error('Unhandled error:', err);
    return res.status(400).json({ error: err.message || 'Request failed' });
  }

  return next();
});

// Local development only. On Vercel the platform imports this app and mounts it
// as a serverless function via api/index.js — binding a port there would error.
if (process.env.VERCEL !== '1') {
  const PORT = process.env.API_PORT || 3001;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Admin API server running on port ${PORT}`);
    console.log(`CORS allow-list: ${ALLOWED_ORIGINS.join(', ')}`);
    if (!firebaseInitialized) {
      console.log('Warning: Firebase Admin SDK not initialized. Add FIREBASE_SERVICE_ACCOUNT_KEY secret.');
    }
  });
}

module.exports = app;
