import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { Suspense, lazy, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import ScrollToTop from './components/ScrollToTop';
import Navbar from './components/Navbar';
import TopBanner from './components/TopBanner';
import SimpleCopyright from './components/SimpleCopyright';
import WhatsAppButton from './components/WhatsAppButton';
import CustomToast from './components/CustomToast';
import ProtectedRoute from './components/ProtectedRoute';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { useReducedMotion } from './hooks/useReducedMotion';
import { pageVariants } from './lib/motion';
import { trackPageview as trackGaPageview } from './lib/analytics';
import { ProductGridSkeleton } from './components/ui/Skeleton';
import { trackPageview } from './utils/siteTracker';

// Storefront routes stay eager — these are the pages visitors land on.
import Home from './pages/Home';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import OrderSuccess from './pages/OrderSuccess';
import TrackOrder from './pages/TrackOrder';
import Login from './pages/Login';
import Profile from './pages/Profile';
import MyOrders from './pages/MyOrders';

// Staff and admin surfaces load on demand. They are large, they are reached by
// a handful of users, and keeping them out of the entry chunk is the single
// biggest win available to the shopper's first paint.
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminAnalytics = lazy(() => import('./pages/AdminAnalytics'));
const AddProduct = lazy(() => import('./pages/AddProduct'));
const EditProduct = lazy(() => import('./pages/EditProduct'));
const AllProducts = lazy(() => import('./pages/AllProducts'));
const Orders = lazy(() => import('./pages/Orders'));
const AdminOrderDetail = lazy(() => import('./pages/AdminOrderDetail'));
const Billing = lazy(() => import('./pages/Billing'));
const PriceList = lazy(() => import('./pages/PriceList'));
const CanvasEditor = lazy(() => import('./pages/CanvasEditor'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const AdminCategories = lazy(() => import('./pages/AdminCategories'));

/* Roles permitted on the two shared staff surfaces. These deliberately mirror
   the navigation predicates in Navbar/MobileMenu — if you change one, change
   the other, or staff get menu links that bounce them home. Firestore rules
   already grant these roles the underlying reads and writes. */
const ORDERS_ROLES = ['admin', 'packer', 'mod'];
const PRICE_LIST_ROLES = ['admin', 'sales', 'billing', 'mod'];

const RouteFallback = () => (
  <div className="shell section-pad-sm">
    <ProductGridSkeleton count={4} label="Loading page" />
  </div>
);

function AppContent() {
  const location = useLocation();
  const reduced = useReducedMotion();
  const isHomePage = location.pathname === '/';
  const showTopBanner = ['/', '/products', '/cart', '/profile'].includes(location.pathname);
  // The billing register is a dedicated POS terminal: it owns the whole
  // viewport and must not carry the storefront chrome (banner, navbar,
  // copyright, floating WhatsApp button).
  const isBillingPath = location.pathname === '/admin/billing';

  /* Two independent pageview channels, deliberately not merged.

     GA4 skips the initial load because gtag('config') in index.html has
     already reported it, and it follows the search string because Google's
     reports treat ?query as part of the page. The first-party tracker does
     neither: it must see the landing page (that hit carries the session's
     referrer) and it keys aggregates by path alone, so a query string cannot
     split one page across many rows. */
  const firstRouteLoad = useRef(true);
  useEffect(() => {
    if (firstRouteLoad.current) {
      firstRouteLoad.current = false;
      return;
    }
    trackGaPageview(location.pathname + location.search, document.title);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const blockImageSave = (e) => {
      if (e.target instanceof HTMLImageElement) {
        e.preventDefault();
      }
    };
    document.addEventListener('contextmenu', blockImageSave);
    document.addEventListener('dragstart', blockImageSave);
    return () => {
      document.removeEventListener('contextmenu', blockImageSave);
      document.removeEventListener('dragstart', blockImageSave);
    };
  }, []);

  /* One pageview per navigation. A single-page app never reloads, so without
     this the shop would only ever see landing pages. The tracker itself decides
     what to skip (staff routes, local development) and never throws. */
  useEffect(() => {
    trackPageview(location.pathname);
  }, [location.pathname]);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-xl focus:bg-white focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:shadow-lift"
        style={{ color: 'var(--maroon-700)' }}
      >
        Skip to main content
      </a>

      <ScrollToTop />
      {!isBillingPath && showTopBanner && <TopBanner />}
      {!isBillingPath && <Navbar />}

      <main
        id="main-content"
        tabIndex={-1}
        className={`focus:outline-none ${isBillingPath ? 'min-h-0 flex-1' : 'flex-grow'}`}
      >
        {/* Enter-only transition: the incoming page never waits on an exit
            animation, so navigation stays as fast as it was. */}
        <motion.div
          key={location.pathname}
          variants={pageVariants(reduced)}
          initial="initial"
          animate="animate"
        >
          <Suspense fallback={<RouteFallback />}>
            <Routes location={location}>
              <Route path="/" element={<Home />} />
              <Route path="/products" element={<Products />} />
              <Route path="/product/:slug" element={<ProductDetail />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/order-success" element={<OrderSuccess />} />
              <Route path="/track-order" element={<TrackOrder />} />
              <Route path="/login" element={<Login />} />
              <Route path="/profile" element={<Profile />} />
              <Route
                path="/my-orders"
                element={
                  <ProtectedRoute>
                    <MyOrders />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute>
                    <Navigate to="/admin/dashboard" replace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/dashboard"
                element={
                  <ProtectedRoute adminOnly>
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/analytics"
                element={
                  <ProtectedRoute adminOnly>
                    <AdminAnalytics />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/billing"
                element={
                  <ProtectedRoute adminOrSales staffOnly>
                    <Billing />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/price-list"
                element={
                  <ProtectedRoute allowRoles={PRICE_LIST_ROLES}>
                    <PriceList />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/add-product"
                element={
                  <ProtectedRoute adminOnly>
                    <AddProduct />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/edit-product/:id"
                element={
                  <ProtectedRoute adminOnly>
                    <EditProduct />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/all-products"
                element={
                  <ProtectedRoute adminOnly>
                    <AllProducts />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/orders"
                element={
                  <ProtectedRoute allowRoles={ORDERS_ROLES}>
                    <Orders />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/orders/:orderId"
                element={
                  <ProtectedRoute allowRoles={ORDERS_ROLES}>
                    <AdminOrderDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/canvas-editor"
                element={
                  <ProtectedRoute adminOnly>
                    <CanvasEditor />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <ProtectedRoute adminOnly>
                    <UserManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/categories"
                element={
                  <ProtectedRoute adminOnly>
                    <AdminCategories />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </Suspense>
        </motion.div>
      </main>

      {!isHomePage && !isBillingPath && <SimpleCopyright />}
      {!isBillingPath && <WhatsAppButton />}
      <CustomToast />
    </>
  );
}

function App() {
  return (
    <Router>
      <ThemeProvider>
        <NotificationProvider>
          <AppShell />
        </NotificationProvider>
      </ThemeProvider>
    </Router>
  );
}

/* Sits below BrowserRouter so it can read the location, and above the page
   content so it can shape the shell (the billing register owns the whole
   viewport and drops the storefront chrome). */
function AppShell() {
  const location = useLocation();
  const isBillingPath = location.pathname === '/admin/billing';
  return (
    <div className={isBillingPath ? 'h-screen overflow-hidden' : 'flex min-h-screen flex-col'}>
      <AppContent />
    </div>
  );
}

export default App;
