# Crackers Hyderabad - Setup Instructions

This document provides comprehensive instructions for setting up Firebase, WhatsApp API, and testing all features.

---

## Table of Contents
1. [Firebase Configuration](#firebase-configuration)
2. [Phone Authentication Setup](#phone-authentication-setup)
3. [WhatsApp API Setup (Twilio)](#whatsapp-api-setup-twilio)
4. [Firestore Security Rules](#firestore-security-rules)
5. [Environment Variables](#environment-variables)
6. [Testing All Features](#testing-all-features)
7. [Troubleshooting](#troubleshooting)

---

## Firebase Configuration

### Step 1: Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" and follow the setup wizard
3. Enable Google Analytics (optional)

### Step 2: Enable Authentication
1. In Firebase Console, go to **Build > Authentication**
2. Click "Get started"
3. Enable the following sign-in methods:
   - **Email/Password**: Click, enable, and save
   - **Google**: Click, enable, configure OAuth consent, and save
   - **Phone**: Click, enable, and save (requires billing - see below)

### Step 3: Enable Firestore Database
1. Go to **Build > Firestore Database**
2. Click "Create database"
3. Choose "Start in production mode"
4. Select your preferred region (asia-south1 for India)
5. Click "Enable"

### Step 4: Enable Firebase Storage
1. Go to **Build > Storage**
2. Click "Get started"
3. Accept default security rules (we'll update them later)
4. Select your preferred region

### Step 5: Get Firebase Config
1. Go to **Project Settings** (gear icon)
2. Scroll down to "Your apps"
3. Click "Add app" and select Web (</>)
4. Register app with a nickname
5. Copy the Firebase configuration object

### Step 6: Update Environment Variables
Create/update `client/.env` with your Firebase config:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

---

## Phone Authentication Setup

Phone authentication requires Firebase Blaze (pay-as-you-go) plan.

### Step 1: Upgrade to Blaze Plan
1. In Firebase Console, click the "Upgrade" button
2. Select "Blaze" plan
3. Add billing information (you won't be charged unless you exceed free tier limits)

### Step 2: Enable Phone Provider
1. Go to **Authentication > Sign-in method**
2. Click "Phone" provider
3. Toggle "Enable"
4. Save

### Step 3: Add Authorized Domains
1. In Authentication settings, go to "Settings" tab
2. Click "Authorized domains"
3. Add your Replit domain: `*.replit.dev`
4. Add your custom domain if applicable

### Step 4: Configure reCAPTCHA (Optional)
For phone auth, Firebase uses reCAPTCHA. The invisible reCAPTCHA is configured automatically.

### Important Notes:
- Phone auth has free tier limits (10 SMS verifications/day for testing)
- Production usage requires payment based on SMS sent
- Error `auth/billing-not-enabled` means Blaze plan is not enabled

---

## WhatsApp API Setup (Twilio)

### Step 1: Create Twilio Account
1. Go to [Twilio Console](https://www.twilio.com/console)
2. Sign up for a free account
3. Verify your phone number

### Step 2: Get Twilio Credentials
1. In Twilio Console, find your credentials:
   - **Account SID**: Starts with "AC..."
   - **Auth Token**: Click to reveal

### Step 3: Enable WhatsApp Sandbox (For Testing)
1. Go to **Messaging > Try it out > Send a WhatsApp message**
2. Follow instructions to join the sandbox:
   - Send the join code to the Twilio sandbox number
   - Example: Send "join <your-code>" to +1 415 523 8886
3. Note your sandbox WhatsApp number

### Step 4: Get Production WhatsApp Number (For Live Use)
1. Go to **Messaging > Senders > WhatsApp senders**
2. Request a production WhatsApp number
3. Complete business verification with Meta

### Step 5: Configure Environment Variables
Add these to your Replit Secrets:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_NUMBER=+14155238886  # Sandbox or production number
```

### WhatsApp Message Templates (Production)
For production WhatsApp, you need approved message templates:
1. Go to **Messaging > Content Editor**
2. Create templates for:
   - Order confirmation
   - Status updates (Packed, Shipped, Delivered, etc.)
   - Invoice delivery

---

## Firestore Security Rules

Deploy these security rules to your Firebase project:

1. Go to **Firestore Database > Rules**
2. Copy the contents of `firestore.rules` file
3. Click "Publish"

### Key Rules:
- **Products**: Public read, admin-only write
- **Orders**: Authenticated read, authenticated create, admin-only update/delete
- **Roles**: Authenticated read, self-create with 'customer' role, admin-only update/delete
- **Users**: Authenticated read/create, self-update, admin-only full access
- **Settings**: Public read, admin-only write

---

## Environment Variables

### Frontend (client/.env)
```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

### Backend (Replit Secrets)
```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=
```

---

## Testing All Features

### 1. Test User Authentication

#### Email/Password Login:
1. Go to `/login`
2. Click "Email" tab
3. Enter email and password
4. Click "Login"
5. Verify redirect to home page

#### Google Login:
1. Go to `/login`
2. Click "Login with Google"
3. Complete Google OAuth flow
4. Verify redirect to home page

#### Phone Login:
1. Go to `/login`
2. Click "Phone" tab
3. Enter phone number (with country code)
4. Click "Send OTP"
5. Enter the OTP received
6. Verify redirect to home page

### 2. Test Role-Based Access

#### Customer Role:
1. Login as a new user
2. Verify access to: Home, Products, Cart, Checkout, My Orders, Profile
3. Verify NO access to: Admin Dashboard, Billing, Canvas Editor

#### Sales Role:
1. Admin assigns "sales" role to a user
2. Login as sales user
3. Verify access to: Billing, Price List
4. Verify NO access to: Admin Dashboard, Canvas Editor, Orders Management

#### Admin Role:
1. Login as admin
2. Verify access to ALL features
3. Go to `/admin/users` to manage user roles

### 3. Test Order Flow

1. Add products to cart
2. Proceed to checkout
3. Fill customer details (name, phone, email, address)
4. Place order
5. Verify:
   - Order appears in "My Orders"
   - Order appears in Admin "Orders Management"
   - Invoice PDF is generated (if enabled)
   - WhatsApp notification is sent (if configured)

### 4. Test Order Status Updates

1. Login as admin
2. Go to `/admin/orders`
3. Find an order
4. Change status using dropdown
5. Verify:
   - Status updates in real-time
   - WhatsApp notification sent to customer (if phone available)

### 5. Test Manual WhatsApp Update

1. Login as admin
2. Go to `/admin/orders`
3. Find an order with customer phone
4. Click "Send Update" button (green with WhatsApp icon)
5. Verify WhatsApp message sent

### 6. Test User Management

1. Login as admin
2. Go to `/admin/users`
3. Search for a user by name, email, or phone
4. Click "Change Role"
5. Select new role (admin/sales/customer)
6. Click "Save Role"
7. Verify role changes immediately

### 7. Test Billing System (Sales/Admin)

1. Login as admin or sales
2. Go to `/admin/billing`
3. Search for products
4. Add items to bill
5. Apply discount if needed
6. Enter customer details
7. Complete sale
8. Verify:
   - Receipt prints correctly
   - WhatsApp invoice sent (if configured)

---

## Troubleshooting

### Phone Authentication Errors

**Error: `auth/billing-not-enabled`**
- Solution: Upgrade to Firebase Blaze plan

**Error: `auth/invalid-phone-number`**
- Solution: Include country code (e.g., +91 for India)

**Error: `auth/too-many-requests`**
- Solution: Wait and try again later (rate limiting)

### WhatsApp Errors

**Error: "Server configuration error"**
- Solution: Verify Twilio environment variables are set correctly

**Error: "Failed to send WhatsApp message"**
- Solution: 
  1. Verify Twilio credentials
  2. For sandbox: Ensure recipient has joined sandbox
  3. For production: Verify WhatsApp number is approved

### Order Not Visible

**Issue: Customer can't see their orders**
- Ensure order is saved with `userId`, `userEmail`, and `userPhone`
- Check Firestore rules allow authenticated read

**Issue: Invoice generation freezes**
- Invoice generation runs in background
- Errors don't block order completion
- Check browser console for errors

### Role Not Working

**Issue: Sales user can't access Billing**
1. Verify role document exists in Firestore `roles` collection
2. Role should be: `{ role: "sales" }`
3. Logout and login again to refresh role

### Firebase Errors

**Error: Permission denied**
- Check Firestore security rules
- Ensure user is authenticated
- Verify role assignments

---

## Support

For additional help:
1. Check Firebase documentation: https://firebase.google.com/docs
2. Check Twilio documentation: https://www.twilio.com/docs
3. Contact support for application-specific issues
