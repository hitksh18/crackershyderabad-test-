# Portable production deployment

This application is a static Vite frontend plus a standard Node/Express API. It does not require a serverless runtime. The current production layout is:

```
browser -> https://crackershyderabad.com
        -> Nginx static frontend (/var/www/crackershyderabad)
        -> /api/ proxy -> PM2: crackers-api (127.0.0.1:3001)
        -> /uploads/ alias -> /var/www/crackershyderabad-media/
```

Firebase provides Authentication and Firestore. Product, canvas, and site imagery is written only by `POST /api/upload` to KVM media storage and stored in Firestore as `https://crackershyderabad.com/uploads/...` URLs.

## Build and publish the frontend

Use Node 20 or later.

```bash
cd client
npm ci
npm run build
```

`client/dist/` is a normal static site (the repository root also exposes this as `npm run build`). Copy its **contents** to `/var/www/crackershyderabad/`. Before building, set the public Firebase web configuration and `VITE_BACKEND_API_URL=/api` in `client/.env.production` or the deployment environment. Do not put service-account credentials or other backend secrets in `VITE_*` variables.

## Run the API with PM2

Deploy the `api/` directory to `/root/crackers-deploy/api/`, then:

```bash
cd /root/crackers-deploy/api
npm install --omit=dev
pm2 start server.js --name crackers-api --update-env
pm2 save
```

Create `/root/crackers-deploy/.env` with server-only values. At minimum it needs `NODE_ENV=production`, `PORT=3001`, `FIREBASE_SERVICE_ACCOUNT_KEY` (a JSON string), `MEDIA_ROOT=/var/www/crackershyderabad-media`, and `MEDIA_PUBLIC_BASE=https://crackershyderabad.com/uploads`. Configure mail/SMS credentials there only if those features are enabled. `ALLOWED_ORIGINS` may add comma-separated browser origins; the production domain is allowed by default.

The API binds to `0.0.0.0` and supports `PORT` (or legacy `API_PORT`). Keep it firewalled from the public internet and let Nginx proxy it.

## Nginx (Hostinger KVM example)

Install this as a site configuration, validate with `nginx -t`, then reload Nginx. Do not overwrite a live configuration without reviewing its TLS settings.

```nginx
server {
    listen 80;
    server_name crackershyderabad.com www.crackershyderabad.com;
    root /var/www/crackershyderabad;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        alias /var/www/crackershyderabad-media/;
        try_files $uri =404;
        expires 30d;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Add TLS with Certbot or your existing certificate setup and redirect HTTP to HTTPS. The `try_files` fallback is required for direct SPA routes such as `/products`, `/product/...`, and `/admin/dashboard`.

## Verification

After publishing, verify `https://crackershyderabad.com/api/health`, an existing `/uploads/...` image, and direct refreshes of a storefront and admin route. Test sign-in, Firestore reads, and one authenticated image upload. The uploaded file must appear beneath `/var/www/crackershyderabad-media/`; do not use Firebase Storage, Cloudinary, or local development disk as persistent media.

This layout is equally suitable for any static server plus a Node process manager. On Apache, configure `/api/` as a reverse proxy, `/uploads/` as an alias, and the same SPA fallback to `index.html`.
