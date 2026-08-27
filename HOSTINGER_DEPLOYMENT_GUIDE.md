# Hostinger VPS Deployment Guide - Crackers Hyderabad

Complete step-by-step guide to deploy your e-commerce platform on Hostinger VPS.

## Prerequisites

### What You Need
- **Hostinger VPS Plan** (KVM 1 minimum - $4.99/month)
- **Domain name** (can purchase from Hostinger or use existing)
- **SSH client** (Terminal on Mac/Linux, PuTTY on Windows)
- **Firebase credentials** (already configured)
- **Twilio credentials** (for WhatsApp invoices)

### Why VPS Instead of Shared Hosting?
Your project requires:
- Node.js runtime (for backend API)
- Custom server configuration
- Multiple ports (5000 for frontend, 3001 for backend)
- Environment variables for Twilio

Shared hosting only supports static HTML/CSS/JS files, so VPS is required.

---

## Step 1: Purchase & Setup Hostinger VPS

### 1.1 Purchase VPS
1. Go to [Hostinger VPS Hosting](https://www.hostinger.com/vps-hosting)
2. Choose **KVM 1** or higher plan
3. Select billing cycle (12 months for best price)
4. Complete checkout

### 1.2 VPS Configuration
1. After purchase, go to **hPanel → VPS**
2. Click your VPS server
3. Choose **Operating System**:
   - Select: **Ubuntu 22.04 64-bit**
   - Set root password (save this securely!)
4. Wait 5-10 minutes for VPS setup
5. Note your **VPS IP address** (you'll need this)

### 1.3 Point Your Domain to VPS
1. Go to **hPanel → Domains**
2. Click **Manage** next to your domain
3. Go to **DNS / Name Servers**
4. Add these records:

```
Type: A
Name: @ (or yourdomain.com)
Points to: YOUR_VPS_IP_ADDRESS
TTL: 3600

Type: A
Name: www
Points to: YOUR_VPS_IP_ADDRESS
TTL: 3600
```

5. Wait 10-30 minutes for DNS propagation

---

## Step 2: Connect to VPS via SSH

### On Mac/Linux:
```bash
ssh root@YOUR_VPS_IP
```

### On Windows:
1. Download [PuTTY](https://www.putty.org/)
2. Enter VPS IP in "Host Name"
3. Click "Open"
4. Login as `root` with your password

---

## Step 3: Initial Server Setup

### 3.1 Update System
```bash
apt update && apt upgrade -y
```

### 3.2 Install Node.js (v20 LTS)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt install -y nodejs
```

Verify:
```bash
node -v  # Should show v20.x.x
npm -v   # Should show 10.x.x
```

### 3.3 Install PM2 Process Manager
```bash
npm install -g pm2
```

### 3.4 Install Nginx Web Server
```bash
# Remove Apache if exists
apt remove --purge apache2 -y

# Install Nginx
apt install nginx -y
systemctl enable nginx
systemctl start nginx
```

### 3.5 Install Git
```bash
apt install git -y
```

### 3.6 Setup Firewall
```bash
apt install ufw -y
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

Type `y` and press Enter when prompted.

---

## Step 4: Deploy Your Application

### 4.1 Clone Your Repository
```bash
# Create app directory
mkdir -p /var/www
cd /var/www

# Clone from GitHub (replace with your repo URL)
git clone https://github.com/YOUR_USERNAME/crackers-hyderabad.git
cd crackers-hyderabad
```

### 4.2 Setup Backend (Express API)

#### Install backend dependencies:
```bash
npm install
```

#### Create backend environment file:
```bash
nano .env
```

Paste this (replace with your actual credentials):
```env
# Twilio WhatsApp API Credentials
TWILIO_ACCOUNT_SID=your_actual_account_sid
TWILIO_AUTH_TOKEN=your_actual_auth_token
TWILIO_WHATSAPP_NUMBER=+14155238886

# Port Configuration
PORT=3001
```

Press `Ctrl + X`, then `Y`, then `Enter` to save.

#### Start backend with PM2:
```bash
pm2 start api/server.js --name backend-api
pm2 save
pm2 startup systemd
```

Copy and run the command that PM2 outputs.

#### Verify backend is running:
```bash
pm2 status
pm2 logs backend-api
```

### 4.3 Setup Frontend (React/Vite)

#### Navigate to client folder:
```bash
cd /var/www/crackers-hyderabad/client
```

#### Create frontend environment file:
```bash
nano .env
```

Paste your Firebase configuration:
```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Backend API URL (will be proxied by Nginx)
VITE_BACKEND_API_URL=https://yourdomain.com
```

Press `Ctrl + X`, then `Y`, then `Enter` to save.

#### Update vite.config.js for production:
```bash
nano vite.config.js
```

Update the proxy configuration:
```javascript
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 5000
  }
})
```

#### Install dependencies and build:
```bash
npm install
npm run build
```

#### Start frontend with PM2:
```bash
pm2 start npm --name frontend -- run preview
pm2 save
```

#### Verify both services are running:
```bash
pm2 status
```

You should see both `backend-api` and `frontend` running.

---

## Step 5: Configure Nginx Reverse Proxy

### 5.1 Create Nginx Configuration
```bash
nano /etc/nginx/sites-available/crackers-hyderabad
```

### 5.2 Paste This Configuration
Replace `yourdomain.com` with your actual domain:

```nginx
# Backend API Server Block
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Backend API routes
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Frontend routes
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Handle React Router
        try_files $uri $uri/ /index.html;
    }

    # Enable gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;
}
```

Press `Ctrl + X`, then `Y`, then `Enter` to save.

### 5.3 Enable Site
```bash
# Create symbolic link
ln -s /etc/nginx/sites-available/crackers-hyderabad /etc/nginx/sites-enabled/

# Remove default site if exists
rm -f /etc/nginx/sites-enabled/default

# Test configuration
nginx -t

# Restart Nginx
systemctl restart nginx
```

### 5.4 Test Your Site
Visit `http://yourdomain.com` - your site should now be live!

---

## Step 6: Setup SSL Certificate (HTTPS)

### 6.1 Install Certbot
```bash
apt install certbot python3-certbot-nginx -y
```

### 6.2 Get SSL Certificate
```bash
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Follow the prompts:
- Enter your email address
- Agree to terms of service (type `A`)
- Choose whether to redirect HTTP to HTTPS (recommend option `2` - redirect)

### 6.3 Test Auto-Renewal
```bash
certbot renew --dry-run
```

Your site is now secured with HTTPS! Visit `https://yourdomain.com`

---

## Step 7: Firebase Security Rules Deployment

### 7.1 Install Firebase CLI on VPS
```bash
npm install -g firebase-tools
```

### 7.2 Login to Firebase
```bash
firebase login --no-localhost
```

Follow the instructions:
1. Copy the URL provided
2. Open in your local browser
3. Login with your Google account
4. Copy the authorization code
5. Paste it back in the terminal

### 7.3 Initialize Firebase in Project
```bash
cd /var/www/crackers-hyderabad
firebase init
```

Select:
- Firestore
- Storage

Use existing project and select your Firebase project.

### 7.4 Deploy Security Rules
```bash
firebase deploy --only firestore:rules
firebase deploy --only storage:rules
```

---

## Step 8: Essential PM2 Commands

### Check App Status
```bash
pm2 status
```

### View Logs
```bash
pm2 logs                    # All apps
pm2 logs backend-api        # Backend only
pm2 logs frontend           # Frontend only
```

### Restart Apps
```bash
pm2 restart all             # Restart everything
pm2 restart backend-api     # Restart backend
pm2 restart frontend        # Restart frontend
```

### Stop Apps
```bash
pm2 stop all
pm2 stop backend-api
pm2 stop frontend
```

### Monitor Resources
```bash
pm2 monit
```

---

## Step 9: Deploy Updates

When you make changes to your code, follow this process:

### 9.1 Pull Latest Code
```bash
cd /var/www/crackers-hyderabad
git pull origin main
```

### 9.2 Update Backend
```bash
# Install new dependencies if any
npm install

# Restart backend
pm2 restart backend-api
```

### 9.3 Update Frontend
```bash
cd client

# Install new dependencies
npm install

# Rebuild
npm run build

# Restart frontend
pm2 restart frontend
```

### Quick Update Script

Create a deployment script:
```bash
nano /root/deploy.sh
```

Paste this:
```bash
#!/bin/bash
echo "🚀 Starting deployment..."

cd /var/www/crackers-hyderabad

echo "📥 Pulling latest code..."
git pull origin main

echo "🔧 Updating backend..."
npm install
pm2 restart backend-api

echo "🎨 Updating frontend..."
cd client
npm install
npm run build
pm2 restart frontend

echo "✅ Deployment complete!"
pm2 status
```

Make it executable:
```bash
chmod +x /root/deploy.sh
```

Now you can deploy updates with:
```bash
/root/deploy.sh
```

---

## Troubleshooting

### Site Not Loading
```bash
# Check PM2 status
pm2 status

# Check Nginx status
systemctl status nginx

# Check Nginx error logs
tail -f /var/log/nginx/error.log

# Check if apps are listening on correct ports
netstat -tlnp | grep -E '3001|5000'
```

### Backend API Not Working
```bash
# Check backend logs
pm2 logs backend-api --lines 100

# Test backend directly
curl http://localhost:3001/api/health
```

### Frontend Not Updating
```bash
# Clear build and rebuild
cd /var/www/crackers-hyderabad/client
rm -rf dist
npm run build
pm2 restart frontend
```

### SSL Certificate Issues
```bash
# Renew certificate manually
certbot renew --force-renewal

# Restart Nginx
systemctl restart nginx
```

### Database Connection Issues
- Verify Firebase credentials in `.env` files
- Check Firebase project settings
- Ensure Firestore and Storage are enabled

---

## Performance Optimization

### Enable Nginx Caching
Add to your Nginx config:
```nginx
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### Monitor Server Resources
```bash
# Check CPU/RAM usage
htop

# Check disk space
df -h

# Check network usage
iftop
```

---

## Backup Strategy

### Daily Automatic Backups

Create backup script:
```bash
nano /root/backup.sh
```

Paste:
```bash
#!/bin/bash
BACKUP_DIR="/root/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup application files
tar -czf $BACKUP_DIR/app_$DATE.tar.gz /var/www/crackers-hyderabad

# Keep only last 7 backups
ls -t $BACKUP_DIR/app_*.tar.gz | tail -n +8 | xargs rm -f

echo "Backup completed: app_$DATE.tar.gz"
```

Make executable:
```bash
chmod +x /root/backup.sh
```

Schedule daily backups:
```bash
crontab -e
```

Add this line (runs daily at 2 AM):
```
0 2 * * * /root/backup.sh
```

---

## Cost Estimate

### Hostinger VPS Pricing
- **KVM 1**: $4.99/month (2 vCPU, 4GB RAM) - Recommended for production
- **KVM 2**: $8.99/month (4 vCPU, 8GB RAM) - Better for high traffic

### Additional Costs
- **Domain**: ~$10-15/year
- **Firebase**: Free tier (Blaze plan for production)
- **Twilio**: Pay-as-you-go (~$0.005 per WhatsApp message)

### Total Monthly Cost
- VPS: $4.99
- Domain: ~$1.25/month
- Firebase + Twilio: ~$5-10 (depending on usage)
- **Total: ~$11-16/month**

---

## Security Checklist

- ✅ Firewall enabled (UFW)
- ✅ SSL certificate installed
- ✅ Strong root password
- ✅ Environment variables secured
- ✅ Nginx security headers
- ✅ PM2 auto-restart enabled
- ✅ Regular backups scheduled
- ✅ Firebase security rules deployed
- ✅ Twilio credentials not exposed

---

## Support Resources

- **Hostinger Support**: https://www.hostinger.com/support
- **Firebase Console**: https://console.firebase.google.com
- **Twilio Console**: https://console.twilio.com
- **PM2 Documentation**: https://pm2.keymetrics.io
- **Nginx Documentation**: https://nginx.org/en/docs

---

## Quick Reference Commands

```bash
# Check all services
pm2 status && systemctl status nginx

# View all logs
pm2 logs --lines 50

# Restart everything
pm2 restart all && systemctl restart nginx

# Deploy updates
/root/deploy.sh

# Check disk space
df -h

# Check memory usage
free -h

# Monitor in real-time
pm2 monit
```

---

## Next Steps After Deployment

1. ✅ **Test all features**: Products, Cart, Checkout, WhatsApp invoices
2. ✅ **Create admin account**: Sign up and add admin role in Firebase
3. ✅ **Add products**: Use Canvas Editor to customize site
4. ✅ **Test orders**: Place test orders to verify PDF + WhatsApp delivery
5. ✅ **Monitor performance**: Use `pm2 monit` for resource usage
6. ✅ **Setup analytics**: Add Google Analytics if needed
7. ✅ **Configure backups**: Test backup/restore process

---

**Congratulations! Your Crackers Hyderabad e-commerce platform is now live on Hostinger! 🎆**

For any issues, check the troubleshooting section or contact support.
