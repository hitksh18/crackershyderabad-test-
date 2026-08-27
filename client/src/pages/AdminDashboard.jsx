import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Plus,
  Package,
  ShoppingCart,
  Star,
  TrendingUp,
  IndianRupee,
  FileText,
  Search,
  Image,
  BarChart3,
  Bell,
  Moon,
  Sun,
  CheckCircle2,
  XCircle,
  Home,
  ChevronRight,
  Users,
  ArrowRight,
  Tag,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from '../utils/toast';
import CustomModal from '../components/CustomModal';
import { useModal } from '../hooks/useModal';
import { useNotifications } from '../contexts/NotificationContext';
import { useTheme } from '../contexts/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { pageVariants, revealVariants, staggerParent } from '../lib/motion';
import { Skeleton, StatCardSkeleton, TableSkeleton } from '../components/ui/Skeleton';
import AnimatedCounter from '../components/ui/AnimatedCounter';
import OrderStatusBadge from '../components/admin/OrderStatusBadge';

const QUICK_ACTIONS = [
  { to: '/admin/analytics', short: 'Analytics', label: 'View live site analytics', icon: BarChart3 },
  { to: '/admin/add-product', short: 'Add', label: 'Add a new product', icon: Plus },
  { to: '/admin/canvas-editor', short: 'Canvas', label: 'Open the canvas editor', icon: Image },
  { to: '/admin/orders', short: 'Orders', label: 'Open orders management', icon: FileText },
  { to: '/admin/billing', short: 'Billing', label: 'Open billing', icon: IndianRupee },
  { to: '/admin/users', short: 'Users', label: 'Users - open user management', icon: Users },
  { to: '/admin/categories', short: 'Categories', label: 'Manage product categories', icon: Tag },
  { to: '/admin/all-products', short: 'Products', label: 'Open all products', icon: Package },
];

const chipStyle = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-card)',
  color: 'var(--text-body)',
};

const AdminDashboard = () => {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [globalSearch, setGlobalSearch] = useState('');
  const { isOpen, modalConfig, closeModal, handleConfirm } = useModal();
  const { unreadCount, liveOrderCount, serverStatus, markAllAsRead } = useNotifications();
  const { isDark, toggleTheme } = useTheme();
  const reduced = useReducedMotion();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const productsSnap = await getDocs(collection(db, 'products'));
      const productsData = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(productsData);

      const ordersSnap = await getDocs(collection(db, 'orders'));
      const ordersData = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Store orders (Billing) write a JS Date; online orders a Timestamp.
      const epochMs = (t) => t?.seconds ? t.seconds * 1000 : (t?.getTime?.() ?? 0);
      setOrders(ordersData.sort((a, b) => epochMs(b.createdAt) - epochMs(a.createdAt)));
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const topProducts = products
    .filter(p => p.salesCount > 0)
    .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))
    .slice(0, 5);

  const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const featuredCount = products.filter(p => p.isFeatured).length;

  const isOnline = serverStatus === 'online';

  const kpis = [
    {
      key: 'revenue',
      label: 'Total Revenue',
      value: totalRevenue,
      hint: 'All time',
      currency: true,
      icon: TrendingUp,
      accent: 'var(--ember-600)',
    },
    {
      key: 'orders',
      label: 'Total Orders',
      value: orders.length,
      hint: 'All time',
      icon: ShoppingCart,
      accent: 'var(--gold-500)',
    },
    {
      key: 'products',
      label: 'Total Products',
      value: products.length,
      hint: `${featuredCount} featured`,
      icon: Package,
      accent: 'var(--maroon-700)',
    },
    {
      key: 'featured',
      label: 'Featured Products',
      value: featuredCount,
      hint: `of ${products.length} products`,
      icon: Star,
      accent: 'var(--gold-500)',
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="shell section-pad-sm">
          <div className="mb-8 space-y-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-11 w-full max-w-2xl" />
          </div>
          <div className="mb-8">
            <StatCardSkeleton count={4} />
          </div>
          <div
            className="rounded-[var(--r-lg)] border p-5"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
          >
            <Skeleton className="mb-4 h-4 w-40" />
            <TableSkeleton rows={5} cols={4} label="Loading dashboard" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <CustomModal isOpen={isOpen} onClose={closeModal} onConfirm={handleConfirm} {...modalConfig} />

      <motion.div
        variants={pageVariants(reduced)}
        initial="initial"
        animate="animate"
        className="shell section-pad-sm"
      >
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            <li className="flex items-center gap-1.5">
              <Home className="h-3.5 w-3.5" aria-hidden="true" style={{ color: 'var(--ember-600)' }} />
              <span>Admin</span>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="h-3.5 w-3.5" />
            </li>
            <li aria-current="page" className="font-semibold" style={{ color: 'var(--text-strong)' }}>
              Dashboard
            </li>
          </ol>
        </nav>

        {/* Command bar */}
        <header className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="label-caps">Operations</span>
            <h1 className="section-title mt-1.5">Admin Dashboard</h1>
            <p className="mt-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
              Manage your crackers inventory and orders
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--r-md)] border px-3 text-xs font-semibold"
              style={chipStyle}
            >
              {isOnline ? (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" style={{ color: '#3E9A6B' }} strokeWidth={2.2} />
              ) : (
                <XCircle className="h-4 w-4" aria-hidden="true" style={{ color: '#E14848' }} strokeWidth={2.2} />
              )}
              Server {isOnline ? 'Online' : 'Offline'}
            </span>

            <span
              className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--r-md)] border px-3 text-xs font-semibold"
              style={chipStyle}
            >
              <ShoppingCart className="h-4 w-4" aria-hidden="true" style={{ color: 'var(--gold-500)' }} strokeWidth={2.2} />
              <span className="tabular">{liveOrderCount}</span> Orders
            </span>

            <button
              type="button"
              onClick={markAllAsRead}
              aria-label={
                unreadCount > 0
                  ? `${unreadCount} unread order notifications. Mark all as read`
                  : 'Order notifications. Mark all as read'
              }
              className="relative grid h-11 w-11 place-items-center rounded-[var(--r-md)] border transition-[border-color,transform] duration-150 hover:border-[var(--hairline-strong)] active:scale-[0.97]"
              style={chipStyle}
            >
              <Bell className="h-4 w-4" aria-hidden="true" strokeWidth={2.2} />
              {unreadCount > 0 && (
                <span
                  className="tabular absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-[var(--r-pill)] px-1 text-[10px] font-bold"
                  style={{ background: 'var(--crimson-600)', color: '#FFFFFF' }}
                >
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-pressed={isDark}
              className="grid h-11 w-11 place-items-center rounded-[var(--r-md)] border transition-[border-color,transform] duration-150 hover:border-[var(--hairline-strong)] active:scale-[0.97]"
              style={chipStyle}
            >
              {isDark ? (
                <Sun className="h-4 w-4" aria-hidden="true" style={{ color: 'var(--saffron-400)' }} strokeWidth={2.2} />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" strokeWidth={2.2} />
              )}
            </button>
          </div>
        </header>

        {/* Global search */}
        <div className="mb-8">
          <label htmlFor="admin-global-search" className="sr-only">
            Search products, orders, customers and categories
          </label>
          <div className="relative max-w-2xl">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
              style={{ color: 'var(--text-subtle)' }}
            />
            <input
              id="admin-global-search"
              type="text"
              placeholder="Search products, orders, customers, categories..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="input-premium pl-11"
            />
          </div>
        </div>

        {/* KPI row */}
        <motion.div
          variants={staggerParent(reduced, 0.05)}
          initial="hidden"
          animate="visible"
          className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {kpis.map(({ key, label, value, hint, currency, accent, icon: Icon }) => (
            <motion.article
              key={key}
              variants={revealVariants(reduced, 14)}
              className="card-premium relative overflow-hidden p-5"
            >
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />
              <div className="flex items-start justify-between gap-3 pl-2">
                <div className="min-w-0">
                  <p className="label-caps">{label}</p>
                  <p
                    className="mt-2 flex items-center gap-0.5 text-[1.6rem] font-semibold leading-none"
                    style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-body)' }}
                  >
                    {currency && <IndianRupee className="h-5 w-5 shrink-0" aria-hidden="true" strokeWidth={2.6} />}
                    <AnimatedCounter value={value} />
                  </p>
                  <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {hint}
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] border"
                  style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)' }}
                >
                  <Icon className="h-4 w-4" style={{ color: accent }} strokeWidth={2} />
                </span>
              </div>
            </motion.article>
          ))}
        </motion.div>

        {/* Quick actions */}
        <section
          aria-labelledby="quick-actions-heading"
          className="mb-8 rounded-[var(--r-lg)] border p-4 sm:p-5"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
        >
          <h2 id="quick-actions-heading" className="label-caps">
            Quick Actions
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {QUICK_ACTIONS.map(({ to, short, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                aria-label={label}
                className="flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-[var(--r-md)] border border-[var(--hairline)] bg-[var(--surface-sunken)] px-2 py-3 text-center transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-[rgba(195,58,20,0.32)] hover:bg-[var(--surface-card)]"
              >
                <Icon className="h-5 w-5" aria-hidden="true" style={{ color: 'var(--ember-600)' }} strokeWidth={1.9} />
                <span className="text-xs font-semibold" style={{ color: 'var(--text-body)' }}>
                  {short}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Register: recent orders + top products */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <section
            aria-labelledby="recent-orders-heading"
            className="rounded-[var(--r-lg)] border p-5"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
          >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="recent-orders-heading" className="card-title">
                  Recent Orders
                </h2>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Latest 3 orders
                </p>
              </div>
              <Link to="/admin/orders" className="btn-quiet min-h-[44px] px-3">
                View All
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            {orders.length === 0 ? (
              <div
                className="flex flex-col items-center gap-2 rounded-[var(--r-md)] border border-dashed py-10 text-center"
                style={{ borderColor: 'var(--hairline-strong)' }}
              >
                <FileText className="h-6 w-6" aria-hidden="true" style={{ color: 'var(--text-subtle)' }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  No orders yet
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {orders.filter(order => {
                  const q = globalSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (order.customer?.name || '').toLowerCase().includes(q)
                    || String(order.shortCode || order.id || '').toLowerCase().includes(q)
                    || (order.status || '').toLowerCase().includes(q);
                }).slice(0, 3).map((order) => (
                  <li
                    key={order.id}
                    className="rounded-[var(--r-md)] border p-4"
                    style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                          {order.customer?.name || order.customerName || 'N/A'}
                        </p>
                        <p className="tabular mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                          Order #{order.shortCode || order.id.substring(0, 8)}
                        </p>
                      </div>
                      <OrderStatusBadge status={order.status || 'Pending'} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
                      <span
                        className="tabular inline-flex items-center text-base font-bold"
                        style={{ color: 'var(--text-strong)' }}
                      >
                        <IndianRupee className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2.6} />
                        {(order.total || 0).toLocaleString('en-IN')}
                      </span>
                      <span className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
                        {order.createdAt?.toDate?.()
                          ? order.createdAt.toDate().toLocaleDateString()
                          : order.createdAt?.getTime
                            ? new Date(order.createdAt).toLocaleDateString()
                            : '—'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            aria-labelledby="inventory-heading"
            className="rounded-[var(--r-lg)] border p-5"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
          >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="inventory-heading" className="card-title">
                  Product Inventory
                </h2>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Top-selling preview
                </p>
              </div>
              <Link to="/admin/all-products" className="btn-quiet min-h-[44px] px-3">
                View All Products
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            {topProducts.length === 0 ? (
              <div
                className="flex flex-col items-center gap-2 rounded-[var(--r-md)] border border-dashed py-10 text-center"
                style={{ borderColor: 'var(--hairline-strong)' }}
              >
                <Star className="h-6 w-6" aria-hidden="true" style={{ color: 'var(--text-subtle)' }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  No sales data yet
                </p>
              </div>
            ) : (
              <ol className="space-y-2">
                {topProducts.filter(product => {
                  const q = globalSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (product.name || '').toLowerCase().includes(q)
                    || (product.category || '').toLowerCase().includes(q);
                }).map((product, index) => (
                  <li
                    key={product.id}
                    className="flex items-center gap-3 rounded-[var(--r-md)] border p-3"
                    style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
                  >
                    <span
                      aria-hidden="true"
                      className="tabular grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] text-xs font-bold"
                      style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline-strong)', color: 'var(--text-strong)' }}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                        {product.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="badge badge-neutral">{product.category}</span>
                        <span className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
                          {product.salesCount || 0} sold
                        </span>
                      </div>
                    </div>
                    <Star
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                      style={{ color: 'var(--gold-500)' }}
                      strokeWidth={2}
                    />
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminDashboard;
