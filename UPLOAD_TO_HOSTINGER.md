# Upload Your Website to Hostinger - Simple Guide

Your website is now built and ready to upload! Follow these easy steps:

---

## What You Have Ready

Your `client/dist/` folder contains everything you need:
- `index.html` - Main website file
- `.htaccess` - Configuration for proper routing
- `favicon.png` - Your website icon
- `assets/` - All CSS and JavaScript files
- `images/` - Your images

**Total size**: ~2 MB (very small and fast!)

---

## Step-by-Step Upload Instructions

### Step 1: Login to Hostinger

1. Go to: **https://hpanel.hostinger.com**
2. Enter your Hostinger email and password
3. Click on your website name

### Step 2: Open File Manager

1. In the left menu, click **Files**
2. Click **File Manager**
3. You'll see a folder called `public_html`

### Step 3: Clean the Folder (First Time Only)

1. Click on `public_html` to open it
2. **Delete any default files** (like index.html or default.html)
3. Make sure `public_html` is empty

### Step 4: Upload Your Website

**Method 1: Upload as ZIP (Recommended - Easier)**

1. On your computer, go to the `client/dist/` folder
2. Select ALL files inside dist folder:
   - index.html
   - .htaccess
   - favicon.png
   - assets folder
   - images folder
3. Right-click and create a ZIP file called `website.zip`
4. In Hostinger File Manager, make sure you're in `public_html`
5. Click **Upload Files** button
6. Select `website.zip` and upload
7. Wait for upload to complete
8. Right-click on `website.zip` and select **Extract**
9. Delete `website.zip` after extraction

**Method 2: Upload Files Directly**

1. In Hostinger File Manager, make sure you're in `public_html`
2. Click **Upload Files** button
3. Select ALL files from your `client/dist/` folder
4. Upload them
5. Wait for all files to finish uploading

### Step 5: Check File Structure

Your `public_html` should now look like this:

```
public_html/
├── index.html          ✅
├── .htaccess          ✅ (hidden file - enable "Show Hidden Files" in settings to see it)
├── favicon.png        ✅
├── assets/            ✅
└── images/            ✅
```

**CRITICAL**: Make sure `index.html` is DIRECTLY in `public_html`, NOT in a subfolder!

### Step 6: Enable Hidden Files (To See .htaccess)

1. In File Manager, click **Settings** (gear icon)
2. Check "Show Hidden Files"
3. Click **Save**
4. Now you should see `.htaccess` file

### Step 7: Setup SSL Certificate (HTTPS)

1. Go back to hPanel main menu
2. Click **SSL** in the left menu
3. Select your domain
4. Click **Install SSL Certificate**
5. Choose **Free SSL** (Let's Encrypt)
6. Wait 5-10 minutes for activation

### Step 8: Add Your Domain to Firebase

1. Go to: **https://console.firebase.google.com**
2. Select your project: **standard-crackers-store**
3. Go to **Authentication** → **Settings** → **Authorized domains**
4. Click **Add domain**
5. Add your domain (e.g., `yourdomain.com`)
6. Click **Add**

### Step 9: Test Your Website

Visit your domain: `https://yourdomain.com`

**Test these features:**
- ✅ Homepage loads correctly
- ✅ You can browse products
- ✅ Category buttons work
- ✅ Search works
- ✅ Can add items to cart
- ✅ Can login/signup
- ✅ Admin can manage products

**Note**: WhatsApp invoice delivery will NOT work on static hosting (you need VPS for that feature).

---

## Important Notes

### Your Firebase Configuration
Your website uses these Firebase credentials (already configured):
- Project ID: `standard-crackers-store`
- All data is stored in Firebase (safe and secure)

### Features That Work
- ✅ Shopping cart
- ✅ Product browsing
- ✅ User authentication
- ✅ Order placement
- ✅ Admin dashboard
- ✅ Canvas Editor
- ✅ All frontend features

### Features That Don't Work (Static Hosting)
- ❌ WhatsApp invoice delivery (needs backend server)
- Solution: Upgrade to VPS hosting if you need this feature

---

## Troubleshooting

### Problem: Blank page after upload
**Solution**:
1. Open browser console (Press F12)
2. Check for errors
3. Make sure all files uploaded correctly

### Problem: 404 Error when clicking links
**Solution**:
- Enable "Show Hidden Files" in File Manager settings
- Check that `.htaccess` file is in `public_html`

### Problem: Website shows "Index of /"
**Solution**:
- Make sure `index.html` is directly in `public_html`
- NOT in a subfolder like `public_html/dist/`

### Problem: Images not showing
**Solution**:
- Check that `images/` folder uploaded completely
- Verify Firebase Storage rules allow public read

---

## Updating Your Website Later

When you make changes to your code:

1. Make your changes in the code
2. Run build command:
   ```bash
   cd client
   npm run build
   ```
3. Delete old files from `public_html` in Hostinger
4. Upload new files from `dist/` folder

---

## File Locations Reference

**On Your Computer:**
- Your code: `client/src/`
- Built files ready for upload: `client/dist/`

**On Hostinger:**
- Upload location: `public_html/`
- All files go directly inside `public_html/`

---

## Cost Summary

- **Hostinger Hosting**: ~$3/month (your Premium plan)
- **Firebase**: Free tier (or ~$0-2/month for production)
- **Total**: ~$3-5/month

Much cheaper than VPS hosting!

---

## Need Help?

- **Hostinger Support**: https://www.hostinger.com/support
- **File Manager Guide**: Check hPanel tutorials
- **Firebase Console**: https://console.firebase.google.com

---

## Next Steps After Upload

1. ✅ Test all website features
2. ✅ Create your admin account (sign up on website)
3. ✅ Set your role to 'admin' in Firebase Console
4. ✅ Add products using Admin Dashboard
5. ✅ Customize using Canvas Editor
6. ✅ Start selling!

---

**Your website is production-ready and optimized for Hostinger shared hosting!**

For detailed technical information, see `HOSTINGER_STATIC_HOSTING_GUIDE.md`.
