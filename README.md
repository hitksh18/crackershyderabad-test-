# Crackers Hyderabad — E-Commerce Platform

Premium fireworks storefront for Standard Fireworks: product catalogue, cart,
checkout with order tracking, PDF invoices, and a role-based admin panel
(products, orders, billing/POS, users, categories, homepage builder, analytics).

## Architecture

One codebase, two runtimes:

| Part | Tech | Runs on |
|---|---|---|
| `client/` | Vite 7 + React 19 SPA, Firebase client SDK (Auth + Firestore), React Router, TailwindCSS | Vercel (static) **and** Hostinger (Nginx static) |
| `api/` | Express 5 + Firebase Admin SDK (auth, orders, users, notifications, media) | Hostinger KVM only (PM2 on port 3001, behind Nginx `/api` reverse proxy) |

There is intentionally **no** Vercel serverless backend: `api/server.js` is a
long-lived Express process (file uploads, Nodemailer, local media writes) that
cannot run as serverless functions. On Vercel the frontend's same-origin
`/api/*` and `/uploads/*` calls are rewritten to the production Hostinger
server (see `vercel.json`), so one build works on both hosts.

Other pieces:

- **Firebase** — Auth + Firestore. The browser reads the public catalogue
  directly; all writes/pricing go through `api/` with the Admin SDK.
  Rules live in `firestore.rules` (deploy with
  `firebase deploy --only firestore:rules --project standard-crackers-store`).
- **Media** — permanent files live on the KVM at
  `/var/www/crackershyderabad-media`, served as
  `https://crackershyderabad.com/uploads/...` by Nginx.
- `scripts/` — one-off maintenance/migration scripts (run manually, never shipped).
- `tests/` — Firestore rules suite (needs the Firebase emulator, see file header).

## Project structure

```
crackers-hyderabad/
├── client/            # Vite + React storefront (src/, public/, package.json, vite.config.js)
├── api/               # Express API (server.js, lib/) — Hostinger KVM only
├── scripts/           # maintenance / migration scripts (dev-only)
├── tests/             # Firestore rules tests (emulator)
├── deploy.sh          # runs ON the KVM to install a deploy tarball
├── vercel.json        # Vercel build config + SPA rewrites + /api + /uploads proxy
├── firebase.json      # points at firestore.rules
├── firestore.rules    # Firestore security rules
├── .env.example       # server + deploy + browser variable template (no secrets)
└── README.md
```

## Local development

Prerequisites: Node.js 22.

```bash
npm --prefix client install     # frontend deps
npm --prefix api install        # backend deps (needs sharp build tools)
```

```bash
npm run dev        # storefront on http://localhost:5000 (proxies /api → :3001)
npm run dev:api    # Express API on http://localhost:3001 (NODE_ENV unset = dev)
```

> Uploads only persist when the API runs with `NODE_ENV=production` against a
> real `MEDIA_ROOT`. In dev, uploads are rejected by design so throwaway files
> never become production content.

## Environment variables

Copy `.env.example` → `.env` for the server. Browser variables are `VITE_*`
in `client/.env*`:

| Variable | Where | Notes |
|---|---|---|
| `VITE_FIREBASE_API_KEY` (+ `AUTH_DOMAIN`, `PROJECT_ID`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID`) | browser, build time | Public web config; committed in `client/.env.production` as the CI fallback, overridable via secrets |
| `VITE_BACKEND_API_URL` | browser, build time | Always `/api` (same-origin; Nginx on Hostinger, rewrite on Vercel) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | server only | Full service-account JSON; never in browser code |
| `PORT`, `ALLOWED_ORIGINS` | server only | `PORT` honoured (KVM uses 3001) |
| `EMAIL_HOST/PORT/USER/PASS` | server only | SMTP for order invoices |
| `MSG91_AUTH_KEY/SENDER_ID/ROUTE` | server only | Order SMS |
| `MEDIA_ROOT`, `MEDIA_PUBLIC_BASE` | server only | KVM media path + public base URL |
| `DEPLOY_TOKEN`, `DEPLOY_HOST` | CI only | GitHub Secrets for the Hostinger deploy step |

## Build & verify

```bash
npm run lint     # eslint over client/
npm run build    # vite build → client/dist/
npm run preview  # serve the production bundle locally
```

CI (`.github/workflows/ci.yml`) runs install → lint → build on every push/PR
using the committed `client/.env.production` fallback, so it needs no secrets.

## Deploy — Vercel

`vercel.json` pins everything; no dashboard tweaks required:

- `installCommand`: `npm ci --prefix client --no-audit --no-fund`
  (the previous failure: Vercel installed only root deps, so `vite` was missing)
- `buildCommand`: `npm run build --prefix client`
- `outputDirectory`: `client/dist`
- Rewrites: `/api/*` and `/uploads/*` → `https://crackershyderabad.com/...`,
  everything else → `/index.html` (SPA deep links: `/products`, `/admin`, …)

Optional: set the six `VITE_FIREBASE_*` vars in the Vercel dashboard to
override the committed fallback.

## Deploy — Hostinger (KVM)

`.github/workflows/deploy-hostinger.yml` runs on every push to `main`:

1. `node scripts/generate-sitemap.mjs` refreshes `client/public/sitemap.xml`
2. Firebase secrets overlay `client/.env.production.local` **only when set**
   (unset secrets previously blanked the committed fallback — fixed)
3. `npm ci` + `vite build` in `client/`
4. Tarball (`dist/`, `api/`, `scripts/`, `deploy.sh`) POSTed to
   `https://$DEPLOY_HOST/api/deploy` with `DEPLOY_TOKEN`
5. `deploy.sh` on the KVM swaps `/var/www/crackershyderabad`, reinstalls
   `api/` deps, and restarts the `crackers-api` PM2 process

Required GitHub Secrets: `DEPLOY_TOKEN`, `DEPLOY_HOST`
(`VITE_FIREBASE_*` optional — committed fallback covers them).
Server env (on the KVM, never in git): `FIREBASE_SERVICE_ACCOUNT_KEY`,
`EMAIL_*`, `MSG91_*`. `service-account.json` is git-ignored; keep it out of git.

## Security notes

See `SECURITY.md` before deploying (rules deploy order matters). Never commit
`.env`, `service-account*.json`, `*.zip` deploy archives, or `node_modules` —
all are git-ignored.
