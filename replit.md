# Crackers Hyderabad - E-Commerce Website

## Overview
Crackers Hyderabad is a production-ready e-commerce platform for selling crackers and fireworks, targeting the Hyderabad market. It offers a comprehensive online shopping experience and a robust admin dashboard. The platform supports dual pricing (online and offline) and includes a dedicated billing system for physical store operations, all built with a modern, scalable tech stack. Its purpose is to provide a professional, festive-themed interface to maximize sales and manage inventory efficiently.

## User Preferences
- Clean, professional design without emojis
- Crackers Hyderabad branding
- Firebase-only architecture (no external backend needed)
- Red-orange-gold festive color scheme
- Dual pricing system (online/offline)
- Professional billing system for store
- Smooth animations with Framer Motion
- Mobile-first responsive design
- PDF invoice generation
- Free WhatsApp messaging via Click-to-Chat links

## System Architecture

### UI/UX Decisions
- **Design Theme**: Deep red to orange primary colors (#6B0F0F to #FF8E00) with golden yellow accents (#F8C330) and a soft background (#F7F9FB).
- **Typography**: Poppins for headings and Inter for body text.
- **Animations**: Consistent 0.2s ease transitions, with a slow 20s zoom animation on the hero background.
- **Branding**: "Crackers Hyderabad" branding with the Standard Fireworks logo, festive background, and a professional aesthetic.
- **Hero Section**: Fully responsive and highly customizable via Canvas Editor, including background images, logos (main and optional side logos), text editing, and spacing controls. Features a single slow-scrolling promotional banner.
- **Footer**: Compact 3-column layout with contact information, quick links (Products, Cart, My Orders), and a larger logo.
- **Responsiveness**: Fully responsive design across mobile, tablet, and desktop using media queries.
- **Components**: Reusable UI components like ProductCard, custom Modals, and enhanced Toast Notifications for consistency.
- **Search & Navigation**: Centered search bar and a 2-row grid layout for uniform-sized category buttons.

### Technical Implementations
- **Frontend**: React 19 + Vite.
- **Styling**: TailwindCSS 3 with a custom festive theme.
- **Routing**: React Router DOM v7.
- **Authentication**: Firebase Authentication with Google OAuth and Email/Password login.
- **State Management**: React Context for authentication and shopping cart.
- **Dual Pricing System**: Online prices for the website, offline prices for the in-store billing system.
- **Backend API**: Express server (`api/server.js`) with Firebase Admin SDK for full user management capabilities.
- **Admin Panel**:
    - **Canvas Editor**: Visual editor for comprehensive website customization (Hero, Alerts, Footer, Admin Settings), with live preview and Firebase Storage integration for uploads.
    - **Order Management**: Features order deletion, "Cancelled" status, improved display with unique IDs, and **Admin Invoice Download** for any order.
    - **Product Management**: CRUD operations for products with dual pricing, advanced filtering, bulk actions, and quick toggles.
    - **Brand Management**: Add brands with name, logo (URL or file upload), and description.
    - **User Management**: Full Firebase Authentication user listing with admin actions (reset password, disable account, delete user), provider icons, email verification status, creation/sign-in dates.
- **Professional PDF Invoice**: Redesigned invoice with clean border frame, branded header, two-column customer/order info, shaded table headers, fixed column widths, highlighted grand total, and store footer.
- **Professional Billing System**: Designed for in-store sales with product listing, bill generation, smart quantity controls, discount application, multiple payment modes, customer info capture, print receipts via `react-to-print`. Uses offline prices.
- **WhatsApp Integration**: Free Click-to-Chat links for customer support and order updates (opens WhatsApp with pre-filled message).
- **Role-Based Access Control**: `admin`, `sales`, and `customer` roles with specific access permissions. Roles stored in Firestore.
- **Checkout & Payment**: Minimum order value validation (admin-configurable), automatic PDF invoice generation using jsPDF.
- **Security**: Firestore security rules for data integrity and role-based access; Firebase Storage rules for media; Firebase Admin SDK credentials secured as environment secrets.

### Feature Specifications
- **User Features**: Responsive hero, category browsing, live search/filters, shopping cart, minimum order validation, order placement, PDF invoice, WhatsApp support button, animations, "View All Products".
- **Admin Features**: Role-based access, enhanced dashboard with notifications and quick actions, dark mode, global search, product/order management, professional billing, price list, Canvas Editor with minimum order settings, sticky save button, full user management with Firebase Auth integration.

## External Dependencies
- **Frontend**:
  - **Firebase**: Authentication, Firestore, Storage
  - **React 19 + Vite**: Frontend framework and build tool
  - **TailwindCSS 3**: CSS framework
  - **Framer Motion**: Animation library
  - **React Router DOM v7**: Routing
  - **React Hot Toast**: Notifications
  - **React Icons**: Icon library
  - **jsPDF**: PDF generation
  - **react-to-print**: Printing functionality
- **Backend**:
  - **Express**: API server
  - **firebase-admin**: Firebase Admin SDK for user management

## Environment Variables Required
- `FIREBASE_SERVICE_ACCOUNT_KEY`: Firebase service account JSON (for Admin SDK)

## Required Firestore Rules
Make sure to deploy these rules in Firebase Console > Firestore Database > Rules:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null &&
        exists(/databases/$(database)/documents/roles/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/roles/$(request.auth.uid)).data.role == 'admin';
    }

    function isAuthenticated() {
      return request.auth != null;
    }

    match /products/{productId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /orders/{orderId} {
      allow read, create, update, delete: if isAuthenticated();
    }

    match /roles/{userId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /users/{userId} {
      allow read: if isAdmin() || (isAuthenticated() && request.auth.uid == userId);
      allow create: if isAuthenticated();
      allow update: if isAdmin() || (isAuthenticated() && request.auth.uid == userId);
      allow delete: if isAdmin();
    }

    match /brands/{brandId} {
      allow read: if true;
      allow create, update, delete: if isAdmin();
    }

    match /settings/{settingId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /heroSettings/{settingId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /footerSettings/{settingId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /bannerSettings/{settingId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /adminSettings/{settingId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /promotionalBanners/{bannerId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /carts/{cartId} {
      allow read, write: if isAuthenticated() && request.auth.uid == cartId;
    }

    match /analytics/{docId} {
      allow read: if true;
      allow write: if isAdmin();
    }
  }
}
```
