# Quick Hosting Guide - Crackers Hyderabad

## ✅ Your Website is Ready!

Your production files are built and located in: `client/dist/`

---

## 3 Simple Steps to Go Live

### 1️⃣ Login to Hostinger
- Go to: https://hpanel.hostinger.com
- Click **Files** → **File Manager**
- Open `public_html` folder

### 2️⃣ Upload Your Files
**Option A - ZIP Method (Easiest)**
1. Zip ALL files inside `client/dist/` folder
2. Upload ZIP to `public_html`
3. Right-click ZIP → **Extract**
4. Delete ZIP file

**Option B - Direct Upload**
1. Select all files from `client/dist/`
2. Upload to `public_html`
3. Wait for upload to complete

### 3️⃣ Setup SSL & Test
1. hPanel → **SSL** → Install Free SSL
2. Add your domain to Firebase authorized domains
3. Visit your website: `https://yourdomain.com`

---

## File Structure After Upload

Your `public_html` should contain:
```
public_html/
├── index.html
├── .htaccess
├── favicon.png
├── assets/
└── images/
```

---

## ⚠️ Critical Checks

- ✅ `index.html` is DIRECTLY in `public_html` (not in subfolder)
- ✅ `.htaccess` file is present (enable "Show Hidden Files" to see it)
- ✅ SSL certificate installed
- ✅ Domain added to Firebase authorized domains

---

## What Works & What Doesn't

### ✅ Works on Static Hosting
- Complete e-commerce functionality
- Shopping cart
- User authentication
- Order placement
- Admin dashboard
- Canvas Editor
- All Firebase features

### ❌ Doesn't Work (Needs VPS)
- WhatsApp invoice delivery
- Backend API features

---

## Cost: ~$3-5/month

- Hostinger Premium: $3/month
- Firebase: Free tier
- Total: Very affordable!

---

## Need More Help?

📖 **Detailed Guide**: See `UPLOAD_TO_HOSTINGER.md`
📖 **Full Documentation**: See `HOSTINGER_STATIC_HOSTING_GUIDE.md`
🆘 **Support**: https://www.hostinger.com/support

---

## Your Firebase Details

- **Project ID**: standard-crackers-store
- **Console**: https://console.firebase.google.com
- Already configured in your build ✅

---

## After Going Live

1. Test all features
2. Create admin account on website
3. Add products via Admin Dashboard
4. Customize with Canvas Editor
5. Start selling! 🎆

---

**You're ready to launch! Just upload to Hostinger and you're live! 🚀**
