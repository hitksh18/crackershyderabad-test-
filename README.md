# Crackers Hyderabad - E-Commerce Platform

A premium e-commerce platform for Standard Fireworks built with React, Firebase, TailwindCSS, and Framer Motion. Features dual pricing (online/offline), role-based access control, PDF invoice generation with WhatsApp delivery via Twilio, and a complete admin dashboard with visual Canvas Editor.

## Features

### Customer Features
- 🎆 Festive hero section with customizable content via Canvas Editor
- 🛍️ Product browsing with category filters and live search
- 📱 Fully responsive mobile-first design
- 🛒 Shopping cart with localStorage persistence
- ✅ Secure checkout with minimum order value validation
- 📄 Automatic PDF invoice generation
- 💬 WhatsApp invoice delivery after order completion
- 📞 Floating WhatsApp customer support button
- 🎨 Red-orange-gold festive color scheme with smooth animations

### Admin Features
- 🎨 **Canvas Editor**: Visual editor for hero section, alerts, footer, and admin settings
- 🔐 Role-based access control (Admin, Sales, Customer)
- ➕ Product management with dual pricing (online/offline)
- 📦 Order management with status updates and individual deletion
- 💼 Professional billing system for in-store sales
- 📊 Enhanced dashboard with real-time notifications and dark mode
- 📋 Price list page for quick reference
- 🖼️ Firebase Storage integration for image uploads
- 📱 Admin-configurable WhatsApp number and minimum order value

### Sales Features
- 🧾 Access to billing system for in-store sales
- 📋 View price list
- 💰 Offline pricing for store customers

## Tech Stack

### Frontend
- React 19 + Vite
- TailwindCSS 3 with custom festive theme
- Framer Motion for animations
- React Router DOM v7
- React Hot Toast for notifications
- React Icons

### Backend
- Express.js (lightweight API for Twilio integration)
- Twilio WhatsApp API for invoice delivery

### Database & Services
- Firebase Authentication (Email/Password + Google OAuth)
- Firestore Database
- Firebase Storage (for invoices and images)
- jsPDF for invoice generation

## Project Structure

```
crackers-hyderabad/
├── api/
│   └── server.js                 # Express backend for Twilio WhatsApp API
├── client/
│   ├── public/
│   │   └── images/
│   │       ├── hero-bg.jpg
│   │       └── website/
│   │           ├── standard-logo.png
│   │           └── crackerhyderabadlogo.png
│   ├── src/
│   │   ├── components/          # Reusable UI components
│   │   │   ├── Navbar.jsx
│   │   │   ├── Footer.jsx
│   │   │   ├── ProductCard.jsx
│   │   │   ├── WhatsAppButton.jsx
│   │   │   ├── TopBanner.jsx
│   │   │   ├── CustomModal.jsx
│   │   │   ├── CustomToast.jsx
│   │   │   └── ProtectedRoute.jsx
│   │   ├── context/             # Context providers
│   │   │   ├── AuthContext.jsx
│   │   │   └── CartContext.jsx
│   │   ├── contexts/
│   │   │   ├── NotificationContext.jsx
│   │   │   └── ThemeContext.jsx
│   │   ├── hooks/               # Custom React hooks
│   │   │   ├── useHomepageSettings.js
│   │   │   └── useModal.js
│   │   ├── pages/               # Page components
│   │   │   ├── Home.jsx
│   │   │   ├── Products.jsx
│   │   │   ├── ProductDetail.jsx
│   │   │   ├── Cart.jsx
│   │   │   ├── Checkout.jsx
│   │   │   ├── OrderSuccess.jsx
│   │   │   ├── MyOrders.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── Profile.jsx
│   │   │   ├── AdminDashboard.jsx
│   │   │   ├── CanvasEditor.jsx
│   │   │   ├── AddProduct.jsx
│   │   │   ├── EditProduct.jsx
│   │   │   ├── AllProducts.jsx
│   │   │   ├── Orders.jsx
│   │   │   ├── Billing.jsx
│   │   │   └── PriceList.jsx
│   │   ├── utils/               # Utility functions
│   │   │   ├── pdfGenerator.js
│   │   │   ├── initializeFirestore.js
│   │   │   └── initializeHomepageSettings.js
│   │   ├── firebase.js          # Firebase configuration
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── .env.example
│   ├── vite.config.js           # Vite proxy configuration
│   └── package.json
├── firestore.rules              # Firestore security rules
├── storage.rules                # Firebase Storage security rules
├── .env.example                 # Backend environment variables
└── replit.md                    # Project documentation
```

## Installation & Setup

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd crackers-hyderabad
```

### 2. Install Dependencies
```bash
# Install frontend dependencies
cd client
npm install

# Install backend dependencies
cd ..
npm install
```

### 3. Firebase Setup

#### Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable the following services:
   - Authentication (Email/Password + Google Sign-in)
   - Firestore Database
   - Firebase Storage

#### Configure Firebase Collections
The following Firestore collections are required:
- `products` - Product catalog
- `orders` - Customer orders
- `roles` - User role assignments
- `heroSettings` - Hero section customization
- `bannerSettings` - Alert banner configuration
- `footerSettings` - Footer content
- `adminSettings` - WhatsApp number and minimum order value

#### Deploy Firebase Rules
```bash
firebase deploy --only firestore:rules
firebase deploy --only storage:rules
```

### 4. Environment Variables

#### Backend (.env in root)
```bash
cp .env.example .env
```

Add your Twilio credentials:
```env
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_WHATSAPP_NUMBER=+14155238886
PORT=3001
```

#### Frontend (client/.env)
```bash
cd client
cp .env.example .env
```

Add Firebase config:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_BACKEND_API_URL=
```

### 5. Create Admin User

1. Sign up via the website
2. Get your user UID from Firebase Console → Authentication
3. In Firestore, create a document in the `roles` collection:
   - Document ID: `your_user_uid`
   - Field: `role` with value `"admin"`

### 6. Get Twilio WhatsApp API Credentials

1. Create account at [Twilio Console](https://console.twilio.com/)
2. Navigate to Messaging → Try it out → Send a WhatsApp message
3. Copy your Account SID, Auth Token, and WhatsApp number
4. Add to `.env` file in root directory

## Development

### Start Backend API (Port 3001)
```bash
npm run dev
# or
node api/server.js
```

### Start Frontend Dev Server (Port 5000)
```bash
cd client
npm run dev
```

Open http://localhost:5000

## Building for Production

```bash
cd client
npm run build
```

Build output will be in `client/dist/`

## Deployment on Replit

The project is configured for Replit deployment with two workflows:
- `backend-api`: Express server on port 3001
- `dev-server`: Vite frontend on port 5000 (proxies `/api/*` to backend)

Environment variables are managed through Replit Secrets.

## Firebase Collections Structure

### products
```javascript
{
  name: string,
  category: string,
  price: number,              // Online price
  offlinePrice: number,       // Store/billing price
  discountPrice: number | null,
  stock: number,
  description: string,
  imageURL: string,
  isFeatured: boolean,
  salesCount: number,
  createdAt: timestamp
}
```

### orders
```javascript
{
  customer: {
    name: string,
    phone: string,
    email: string,
    address: string,
    city: string,
    pincode: string
  },
  items: array,
  total: number,
  status: string,     // "Pending" | "Packed" | "Shipped" | "Delivered" | "Cancelled"
  invoiceURL: string, // Firebase Storage URL
  createdAt: timestamp
}
```

### roles
```javascript
{
  role: "admin" | "sales" | "customer"
}
```

### heroSettings
```javascript
{
  backgroundImage: string,
  backgroundOverlay: number,
  brightness: number,
  liveMotion: boolean,
  logoImage: string,
  logoSize: number,
  leftLogoImage: string,
  rightLogoImage: string,
  sideLogoSize: number,
  mainHeading: string,
  subHeading: string,
  subtitle: string,
  ctaText: string,
  lineSpacing: number,
  badgeSpacing: number
}
```

### adminSettings
```javascript
{
  whatsappNumber: string,
  whatsappEnabled: boolean,
  minimumOrderValue: number,
  minimumOrderValueEnabled: boolean
}
```

## Security Rules

- **Firestore**: Public read for products/settings, role-based write access
- **Storage**: Public read for images/invoices, admin-only upload
- **Authentication**: Email/Password and Google OAuth

## Key Features Implementation

### Dual Pricing System
- **Online Price**: Used for website customers (cart, checkout)
- **Offline Price**: Used in billing system for in-store sales

### Canvas Editor
- Visual editor for all website content
- Live preview of changes
- Firebase Storage integration for uploads
- Tabs: Hero, Alerts, Footer, Admin Settings

### WhatsApp Invoice Delivery
1. Customer completes checkout
2. PDF invoice generated with jsPDF
3. Uploaded to Firebase Storage (`/invoices/`)
4. Backend API calls Twilio WhatsApp API
5. Invoice link sent to customer's WhatsApp

### Role-Based Access
- **Admin**: Full access to all features
- **Sales**: Billing system and price list only
- **Customer**: Shopping and profile access

## Support

For technical support or inquiries:
- WhatsApp: Configured via Canvas Editor
- Email: Via contact information in footer

## License

Proprietary - All rights reserved.
# crackershyderabad-test-
