# Hostinger Static Hosting Deployment Guide
## Deploy Crackers Hyderabad on Hostinger Shared Hosting

Complete guide to deploy your e-commerce platform as a static website using Hostinger's hPanel File Manager.

---

## ⚠️ Important: Static vs VPS Hosting

### Static Hosting (This Guide)
- **What it is**: Upload pre-built HTML/CSS/JS files to Hostinger's shared hosting
- **Cost**: $1.99-$3.99/month (much cheaper than VPS)
- **What works**: 
  - ✅ Complete website with Firebase (database, auth, storage)
  - ✅ Shopping cart, products, orders
  - ✅ Admin dashboard, Canvas Editor
  - ✅ All frontend features
- **What doesn't work**:
  - ❌ WhatsApp invoice delivery (requires backend server)
  - ❌ Twilio integration
- **Best for**: Budget-friendly hosting, getting started quickly

### VPS Hosting (Alternative)
- **Cost**: $4.99+/month
- **What works**: Everything including WhatsApp invoices
- **Best for**: Full features with backend API
- **Guide**: See `HOSTINGER_DEPLOYMENT_GUIDE.md` for VPS deployment

---

## Prerequisites

### What You Need
1. **Hostinger Shared Hosting Plan** (Premium or Business recommended)
   - Purchase at: https://www.hostinger.com/web-hosting
2. **Domain name** (included with most plans or purchase separately)
3. **Firebase project** (already configured)
4. **Node.js installed locally** (to build the project)

---

## Step 1: Build Your Project Locally

### 1.1 Install Dependencies
```bash
cd client
npm install
```

### 1.2 Configure Environment Variables

Create `client/.env` file:

```env
# Firebase Configuration (REQUIRED)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Backend API URL (Leave empty for static hosting)
# VITE_BACKEND_API_URL=
```

**Important**: For static hosting, leave `VITE_BACKEND_API_URL` empty or comment it out.

### 1.3 Build the Project
```bash
npm run build
```

This creates a `dist/` folder with all your static files.

### 1.4 Verify Build
Check that `dist/` folder contains:
- `index.html`
- `assets/` folder (CSS, JS, images)
- `.htaccess` file
- `favicon.png`
- `images/` folder

---

## Step 2: Upload to Hostinger

### Method 1: Using hPanel File Manager (Recommended)

#### 2.1 Login to Hostinger
1. Go to https://hpanel.hostinger.com
2. Login with your credentials
3. Select your website

#### 2.2 Access File Manager
1. Click **Files** → **File Manager**
2. Navigate to `public_html` folder
3. **Delete default files** (index.html, if any)

#### 2.3 Upload Your Files

**Option A: Upload via File Manager**
1. Click **Upload Files**
2. Select ALL files from your `client/dist/` folder
3. Wait for upload to complete
4. Verify all files are uploaded

**Option B: Upload as ZIP**
1. On your computer, zip the contents of `client/dist/` folder
   - **Important**: Zip the CONTENTS, not the dist folder itself
   - The zip should contain: index.html, assets/, .htaccess, etc.
2. Upload the ZIP file to `public_html`
3. Right-click the ZIP file → **Extract**
4. Delete the ZIP file after extraction

#### 2.4 Verify File Structure

Your `public_html` should look like this:
```
public_html/
├── index.html
├── .htaccess
├── favicon.png
├── assets/
│   ├── index-abc123.js
│   ├── index-def456.css
│   └── ...
└── images/
    └── ...
```

**Critical**: The `index.html` must be directly in `public_html`, NOT in a subfolder!

---

## Step 3: Configure Domain

### 3.1 Point Domain (if using custom domain)

1. Go to **hPanel** → **Domains**
2. Click **Manage** next to your domain
3. Ensure domain points to your hosting account
4. Wait 10-30 minutes for DNS propagation

### 3.2 Set Primary Domain

1. In File Manager, ensure files are in `public_html` for primary domain
2. For subdomain/addon domain:
   - Files go in their respective folders (e.g., `public_html/subdomain`)

---

## Step 4: Configure Firebase Security Rules

### 4.1 Install Firebase Tools Locally
```bash
npm install -g firebase-tools
```

### 4.2 Login to Firebase
```bash
firebase login
```

### 4.3 Initialize Firebase (if not done)
In your project root:
```bash
firebase init
```

Select:
- Firestore
- Storage

### 4.4 Deploy Security Rules
```bash
firebase deploy --only firestore:rules
firebase deploy --only storage:rules
```

This ensures your Firebase database and storage are properly secured.

---

## Step 5: Test Your Website

### 5.1 Access Your Site
Visit your domain: `https://yourdomain.com`

### 5.2 Test Functionality

**Test these features:**
- ✅ Homepage loads with hero section
- ✅ Products page shows all products
- ✅ Category filtering works
- ✅ Search works
- ✅ Shopping cart adds items
- ✅ User can sign up/login
- ✅ Checkout process works
- ✅ Orders are saved to Firebase
- ✅ Admin can login and manage products
- ✅ Canvas Editor works

**Known limitations:**
- ❌ WhatsApp invoice delivery won't work (requires backend)
- PDF invoices will be generated but not sent via WhatsApp

---

## Step 6: Setup SSL Certificate (HTTPS)

### 6.1 Enable Free SSL
1. Go to **hPanel** → **SSL**
2. Select your domain
3. Click **Install SSL**
4. Choose **Free SSL Certificate** (Let's Encrypt)
5. Click **Install**
6. Wait 5-10 minutes

### 6.2 Force HTTPS Redirect

Update `.htaccess` (already included in your build):
```apache
# Force HTTPS
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
```

Your site is now secure with HTTPS!

---

## File Structure for Static Hosting

### Your Built Files (`dist/` folder)
```
dist/
├── index.html              # Main HTML file
├── .htaccess              # Apache configuration
├── favicon.png            # Site favicon
├── assets/                # Bundled JS & CSS
│   ├── index-abc123.js
│   ├── index-def456.css
│   └── vendor-xyz789.js
└── images/                # Static images
    ├── hero-bg.jpg
    └── website/
        └── standard-logo.png
```

### Hostinger File Structure
```
public_html/               # Your domain root
├── index.html            # Directly in public_html
├── .htaccess
├── favicon.png
├── assets/
└── images/
```

---

## Troubleshooting

### Issue: Blank Page After Upload
**Solution**:
1. Check browser console (F12) for errors
2. Verify Firebase credentials in `.env` before build
3. Rebuild with correct environment variables
4. Re-upload files

### Issue: 404 Error on Page Refresh
**Solution**:
- Ensure `.htaccess` file is uploaded
- Check File Manager → **Settings** → Enable "Show Hidden Files"
- Verify `.htaccess` is in `public_html`

### Issue: Images Not Loading
**Solution**:
1. Check image paths in Firebase Storage
2. Ensure `images/` folder uploaded correctly
3. Verify Firebase Storage rules allow public read

### Issue: Website Shows "Index of /"
**Solution**:
- Ensure `index.html` is directly in `public_html`
- Not in a subfolder like `public_html/dist/`

### Issue: CSS/JS Not Loading
**Solution**:
1. Clear browser cache
2. Check `assets/` folder uploaded completely
3. Rebuild project and re-upload

### Issue: Login/Signup Not Working
**Solution**:
1. Check Firebase Authentication is enabled
2. Add your domain to Firebase → Authentication → Authorized domains
3. Verify Firebase API key is correct

---

## Updating Your Website

When you make changes to your code:

### Option 1: Full Rebuild & Upload
```bash
# 1. Make changes to your code
# 2. Rebuild
cd client
npm run build

# 3. Delete old files from public_html
# 4. Upload new dist/ contents
```

### Option 2: Using FTP (Faster for Multiple Updates)
```bash
# 1. Get FTP credentials from hPanel → Files → FTP Accounts
# 2. Use FileZilla or another FTP client
# 3. Connect to your hosting
# 4. Upload only changed files
```

---

## Performance Optimization

### 1. Enable Caching (Already in .htaccess)
Your `.htaccess` includes:
- Browser caching for images (1 year)
- CSS/JS caching (1 month)
- Gzip compression

### 2. Optimize Images
Before uploading:
```bash
# Use image optimization tools
npm install -g imagemin-cli
imagemin images/* --out-dir=images/optimized
```

### 3. Monitor Performance
- Use Google PageSpeed Insights
- Check loading speed: https://tools.pingdom.com
- Optimize based on recommendations

---

## Cost Breakdown

### Static Hosting Costs
- **Hostinger Premium Hosting**: $2.99/month (12-month plan)
- **Domain**: ~$10-15/year (often free first year)
- **Firebase**: Free tier (Blaze plan for production ~$0-5/month)
- **Total**: ~$3-5/month

### Comparison: Static vs VPS
| Feature | Static | VPS |
|---------|--------|-----|
| Cost | $3-5/month | $11-16/month |
| WhatsApp Invoices | ❌ | ✅ |
| All Other Features | ✅ | ✅ |
| Ease of Deployment | Easy | Moderate |
| Maintenance | Low | Medium |

---

## Adding Backend Later (Optional)

If you need WhatsApp invoice functionality:

### Option 1: Upgrade to VPS
- Follow `HOSTINGER_DEPLOYMENT_GUIDE.md`
- Migrate your static site to VPS
- Enable backend API

### Option 2: Use Firebase Functions
- Use Firebase Cloud Functions instead of Express backend
- Update code to call Firebase Functions
- More complex but keeps costs lower

### Option 3: Third-Party Service
- Use services like Zapier or Make.com
- Connect Firebase → WhatsApp
- Requires monthly subscription

---

## Security Checklist

- ✅ SSL certificate installed (HTTPS)
- ✅ Firebase security rules deployed
- ✅ .htaccess security headers
- ✅ No sensitive data in frontend code
- ✅ Firebase API keys restricted by domain
- ✅ Strong admin passwords
- ✅ Regular backups

---

## Backup Strategy

### Manual Backups
1. **hPanel** → **Files** → **Backups**
2. Create weekly backups
3. Download to local storage

### Automated Backups
Hostinger plans include:
- **Premium**: Weekly backups
- **Business**: Daily backups

---

## Support Resources

- **Hostinger Support**: https://www.hostinger.com/support
- **Hostinger Tutorials**: https://www.hostinger.com/tutorials
- **Firebase Console**: https://console.firebase.google.com
- **hPanel File Manager**: https://hpanel.hostinger.com

---

## Quick Reference Commands

### Local Development
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Firebase
```bash
# Deploy security rules
firebase deploy --only firestore:rules
firebase deploy --only storage:rules

# View project info
firebase projects:list
```

---

## Common File Manager Tasks

### Show Hidden Files (to see .htaccess)
1. File Manager → **Settings**
2. Check "Show Hidden Files"
3. Click **Save**

### Set File Permissions
1. Right-click file/folder
2. Select **Permissions**
3. Set to 644 for files, 755 for folders

### Extract ZIP File
1. Upload ZIP to public_html
2. Right-click ZIP file
3. Select **Extract**
4. Delete ZIP after extraction

---

## Migration from Local to Production

### Step-by-Step Migration
1. ✅ Build project locally with production environment variables
2. ✅ Test build locally using `npm run preview`
3. ✅ Upload to Hostinger File Manager
4. ✅ Deploy Firebase security rules
5. ✅ Configure SSL certificate
6. ✅ Test all features on live site
7. ✅ Setup Firebase authorized domains
8. ✅ Monitor performance and errors

---

## Next Steps After Deployment

1. ✅ **Test thoroughly**: Check all features work correctly
2. ✅ **Create admin account**: Sign up and set admin role in Firebase
3. ✅ **Add products**: Use admin dashboard to add inventory
4. ✅ **Customize content**: Use Canvas Editor to personalize site
5. ✅ **Monitor analytics**: Setup Google Analytics if needed
6. ✅ **Plan marketing**: Start promoting your site
7. ✅ **Regular backups**: Schedule weekly backups

---

## Frequently Asked Questions

### Q: Can I use this for high traffic?
**A**: Shared hosting handles moderate traffic well. For high traffic (1000+ daily visitors), consider Business plan or VPS.

### Q: How do I add WhatsApp invoice feature?
**A**: You need VPS hosting for backend API. See `HOSTINGER_DEPLOYMENT_GUIDE.md` or use Firebase Functions.

### Q: Can I use a subdomain?
**A**: Yes! Create subdomain in hPanel, upload files to subdomain folder.

### Q: How to update Firebase credentials?
**A**: Update `.env` file, rebuild with `npm run build`, and re-upload `dist/` contents.

### Q: Site is slow, how to fix?
**A**: Optimize images, enable caching (already in .htaccess), consider CDN, upgrade hosting plan.

---

**Congratulations! Your Crackers Hyderabad e-commerce platform is now live on Hostinger! 🎆**

For VPS hosting with full backend features, refer to `HOSTINGER_DEPLOYMENT_GUIDE.md`.
