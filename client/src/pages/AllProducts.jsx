import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { collection, getDocs, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { ArrowLeft, GripVertical, Package, Plus, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import toast from '../utils/toast';
import CustomModal from '../components/CustomModal';
import { useModal } from '../hooks/useModal';
import ProductRegisterRow from '../components/admin/ProductRegisterRow';
import EmptyState from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/Skeleton';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { revealVariants } from '../lib/motion';
import { deleteTradePricing, fetchTradePricingMap, mergeTradePricing } from '../lib/tradePricing';

const METRIC_TONE = {
  strong: 'var(--text-strong)',
  leaf: 'var(--leaf-600)',
  crimson: 'var(--crimson-600)',
  gold: 'var(--gold-600)',
};

const MetricCell = ({ label, value, tone = 'strong' }) => (
  <div
    className="rounded-[var(--r-md)] border px-4 py-3"
    style={{
      background: 'var(--surface-card)',
      borderColor: 'var(--hairline)',
      boxShadow: 'var(--shadow-xs)',
    }}
  >
    <p className="label-caps">{label}</p>
    <p className="tabular mt-1 text-2xl font-bold leading-none" style={{ color: METRIC_TONE[tone] }}>
      {value}
    </p>
  </div>
);

const AllProducts = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterStock, setFilterStock] = useState('All');
  const [filterFeatured, setFilterFeatured] = useState('All');
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const dirtyRef = useRef(false);
  const { isOpen, modalConfig, openModal, closeModal, handleConfirm } = useModal();
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      /* Wholesale figures live in `productPricing` (staff-only), not on the
         world-readable product document. Fetched alongside, never after. */
      // allSettled, not all: if the pricing read fails the register must still
      // render, or an admin loses delete, reorder, feature and stock controls
      // for every product over a missing price column.
      const [productsResult, pricingResult] = await Promise.allSettled([
        getDocs(collection(db, 'products')),
        fetchTradePricingMap(),
      ]);

      if (productsResult.status === 'rejected') throw productsResult.reason;

      let pricingMap = new Map();
      if (pricingResult.status === 'fulfilled') {
        pricingMap = pricingResult.value;
      } else {
        console.error('Error fetching trade pricing:', pricingResult.reason);
        toast.error('Trade pricing is unavailable — offline prices may be blank.');
      }

      const productsData = mergeTradePricing(
        productsResult.value.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        pricingMap
      );
      setProducts(productsData);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (productId) => {
    const product = products.find(p => p.id === productId);
    openModal({
      title: 'Delete Product',
      message: `Are you sure you want to delete "${product?.name}"?\n\nThis action cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete Product',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'products', productId));
          // Trade pricing is a sibling document; it goes with the product.
          await deleteTradePricing(productId);
          setProducts(products.filter(p => p.id !== productId));
          toast.success('Product deleted successfully');
        } catch (error) {
          console.error('Error deleting product:', error);
          toast.error('Failed to delete product');
        }
      },
    });
  };

  const toggleFeatured = async (productId, currentStatus) => {
    try {
      await updateDoc(doc(db, 'products', productId), {
        isFeatured: !currentStatus
      });
      setProducts(products.map(p =>
        p.id === productId ? { ...p, isFeatured: !currentStatus } : p
      ));
      toast.success(currentStatus ? 'Removed from featured' : 'Added to featured');
    } catch (error) {
      console.error('Error toggling featured:', error);
      toast.error('Failed to update featured status');
    }
  };

  const toggleOutOfStock = async (productId, currentStatus) => {
    try {
      await updateDoc(doc(db, 'products', productId), {
        outOfStock: !currentStatus
      });
      setProducts(products.map(p =>
        p.id === productId ? { ...p, outOfStock: !currentStatus } : p
      ));
      toast.success(currentStatus ? 'Marked as in stock' : 'Marked as out of stock');
    } catch (error) {
      console.error('Error toggling stock status:', error);
      toast.error('Failed to update stock status');
    }
  };

  const sortProductsByOrder = (list) =>
    [...list].sort((a, b) =>
      (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || (a.name || '').localeCompare(b.name || '')
    );

  const moveProduct = async (productId, direction) => {
    try {
      let list = sortProductsByOrder(products);
      const cur = list.findIndex(p => p.id === productId);
      const target = cur + direction;
      if (target < 0 || target >= list.length) return;

      if (list.some(p => p.sortOrder == null)) {
        const batch = writeBatch(db);
        list = list.map((p, i) => ({ ...p, sortOrder: i + 1 }));
        list.forEach(p => {
          batch.set(doc(db, 'products', p.id), { sortOrder: p.sortOrder }, { merge: true });
        });
        await batch.commit();
      }

      const a = list[cur];
      const b = list[target];
      await Promise.all([
        updateDoc(doc(db, 'products', a.id), { sortOrder: b.sortOrder }),
        updateDoc(doc(db, 'products', b.id), { sortOrder: a.sortOrder }),
      ]);

      setProducts(list.map(p => {
        if (p.id === a.id) return { ...p, sortOrder: b.sortOrder };
        if (p.id === b.id) return { ...p, sortOrder: a.sortOrder };
        return p;
      }));
      toast.success('Product order updated');
    } catch (error) {
      console.error('Error reordering product:', error);
      toast.error('Failed to update product order');
    }
  };

  const handleDragStart = (e, productId) => {
    setDragId(productId);
    dirtyRef.current = false;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', productId);
  };

  const reorderInMemory = (targetId) => {
    if (!dragId || dragId === targetId) return;
    const list = sortProductsByOrder(products);
    const from = list.findIndex(p => p.id === dragId);
    const to = list.findIndex(p => p.id === targetId);
    if (from < 0 || to < 0 || from === to) return;

    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);

    dirtyRef.current = true;
    setDragOverId(targetId);
    setProducts(list.map((p, i) => ({ ...p, sortOrder: i + 1 })));
  };

  const handleDragOver = (e, productId) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== productId) {
      reorderInMemory(productId);
    }
  };

  const persistOrder = async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    try {
      const list = sortProductsByOrder(products);
      const batch = writeBatch(db);
      list.forEach((p, i) => {
        batch.set(doc(db, 'products', p.id), { sortOrder: i + 1 }, { merge: true });
      });
      await batch.commit();
      toast.success('Product order updated');
    } catch (error) {
      console.error('Error saving product order:', error);
      toast.error('Failed to save product order');
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    await persistOrder();
  };

  const handleDragEnd = async () => {
    await persistOrder();
    setDragId(null);
    setDragOverId(null);
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = (p.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'All' || (p.categories && Array.isArray(p.categories) ? p.categories.includes(filterCategory) : p.category === filterCategory);
    const matchesStock = filterStock === 'All' ||
      (filterStock === 'In Stock' && !p.outOfStock) ||
      (filterStock === 'Out of Stock' && p.outOfStock);
    const matchesFeatured = filterFeatured === 'All' ||
      (filterFeatured === 'Featured' && p.isFeatured) ||
      (filterFeatured === 'Not Featured' && !p.isFeatured);
    return matchesSearch && matchesCategory && matchesStock && matchesFeatured;
  });

  const categories = ['All', 'Rockets', 'Sparkles', 'Ground Chakkars', 'Fancy Fireworks', 'Gift Boxes', 'Flower Pots', 'Bombs', 'Garlands', 'Kids Special', 'Guns, Rolls & Pop Pop', 'Threads and Novelties'];

  const sortedAll = sortProductsByOrder(products);
  const sortedFiltered = sortProductsByOrder(filteredProducts);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterCategory('All');
    setFilterStock('All');
    setFilterFeatured('All');
  };

  if (loading) {
    return (
      <div className="min-h-screen section-pad-sm" style={{ background: 'var(--surface-page)' }}>
        <div className="shell">
          <p className="label-caps">Operations</p>
          <h1 className="section-title mt-1">All Products</h1>
          <div className="mt-8">
            <TableSkeleton rows={8} cols={4} label="Loading products" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen section-pad-sm" style={{ background: 'var(--surface-page)' }}>
      <CustomModal
        isOpen={isOpen}
        onClose={closeModal}
        onConfirm={handleConfirm}
        {...modalConfig}
      />

      <div className="shell">
        {/* Header */}
        <motion.header
          initial="hidden"
          animate="visible"
          variants={revealVariants(reduced, 14)}
          className="mb-8"
        >
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            className="mb-5 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Dashboard
          </button>

          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <p className="label-caps">Operations</p>
              <h1 className="section-title mt-1">All Products</h1>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                Manage, edit, and categorize your products
              </p>
            </div>

            <Link to="/admin/add-product" className="btn-primary shrink-0 self-start md:self-auto">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add New Product
            </Link>
          </div>
        </motion.header>

        {/* Register metrics */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCell label="Total Products" value={products.length} />
          <MetricCell label="In Stock" value={products.filter(p => !p.outOfStock).length} tone="leaf" />
          <MetricCell label="Out of Stock" value={products.filter(p => p.outOfStock).length} tone="crimson" />
          <MetricCell label="Featured" value={products.filter(p => p.isFeatured).length} tone="gold" />
        </div>

        {/* Filters */}
        <motion.section
          initial="hidden"
          animate="visible"
          variants={revealVariants(reduced, 14)}
          aria-labelledby="product-filters-heading"
          className="mb-6 rounded-[var(--r-lg)] border p-4 sm:p-5"
          style={{
            background: 'var(--surface-card)',
            borderColor: 'var(--hairline)',
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2
              id="product-filters-heading"
              className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-strong)' }}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
              Filters
            </h2>
            <button type="button" onClick={clearFilters} className="btn-quiet">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Clear All
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="product-search" className="label-caps mb-1.5 block">Search</label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                  aria-hidden="true"
                  style={{ color: 'var(--text-subtle)' }}
                />
                <input
                  id="product-search"
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-premium pl-9"
                />
              </div>
            </div>

            <div>
              <label htmlFor="filter-category" className="label-caps mb-1.5 block">Category</label>
              <select
                id="filter-category"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="input-premium"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-stock" className="label-caps mb-1.5 block">Stock Status</label>
              <select
                id="filter-stock"
                value={filterStock}
                onChange={(e) => setFilterStock(e.target.value)}
                className="input-premium"
              >
                <option value="All">All</option>
                <option value="In Stock">In Stock</option>
                <option value="Out of Stock">Out of Stock</option>
              </select>
            </div>

            <div>
              <label htmlFor="filter-featured" className="label-caps mb-1.5 block">Featured Status</label>
              <select
                id="filter-featured"
                value={filterFeatured}
                onChange={(e) => setFilterFeatured(e.target.value)}
                className="input-premium"
              >
                <option value="All">All</option>
                <option value="Featured">Featured</option>
                <option value="Not Featured">Not Featured</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--hairline)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }} role="status" aria-live="polite">
              Showing{' '}
              <span className="tabular font-bold" style={{ color: 'var(--ember-600)' }}>{filteredProducts.length}</span>
              {' '}of{' '}
              <span className="tabular font-bold" style={{ color: 'var(--text-strong)' }}>{products.length}</span>
              {' '}products
            </p>
            <p
              className="hidden items-center gap-1.5 rounded-[var(--r-pill)] border px-3 py-1.5 text-xs font-semibold sm:inline-flex"
              style={{
                background: 'rgba(210, 166, 79, 0.12)',
                borderColor: 'rgba(210, 166, 79, 0.34)',
                color: 'var(--gold-600)',
              }}
            >
              <GripVertical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Drag rows to reorder — customers see this order first
            </p>
          </div>
        </motion.section>

        {/* Register */}
        {filteredProducts.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No products found"
            description="Try adjusting your filters or add a new product"
            action={
              <button type="button" onClick={clearFilters} className="btn-outline">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Clear filters
              </button>
            }
            secondaryAction={
              <Link to="/admin/add-product" className="btn-primary">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add New Product
              </Link>
            }
          />
        ) : (
          <section aria-label="Product register">
            {/* Column header — desktop register only */}
            <div
              className="mb-2 hidden items-center gap-4 rounded-[var(--r-sm)] border px-4 py-2 xl:flex"
              style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)' }}
              aria-hidden="true"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="w-11 shrink-0" />
                <span className="w-14 shrink-0" />
                <span className="label-caps">Product</span>
              </div>
              <span className="label-caps w-[8.5rem] shrink-0">Pricing</span>
              <span className="label-caps w-[11.5rem] shrink-0">Status</span>
              <span className="label-caps w-[8.5rem] shrink-0">Order</span>
              <span className="label-caps w-[6rem] shrink-0 text-right">Actions</span>
            </div>

            <ul role="list" className="flex flex-col gap-2">
              {sortedFiltered.map((product, index) => {
                const position = sortedAll.findIndex(p => p.id === product.id) + 1;
                return (
                  <ProductRegisterRow
                    key={product.id}
                    product={product}
                    position={position}
                    total={sortedAll.length}
                    index={index}
                    reduced={reduced}
                    isDragging={dragId === product.id}
                    isDropTarget={dragId !== product.id && dragOverId === product.id}
                    onDragStart={(e) => handleDragStart(e, product.id)}
                    onDragOver={(e) => handleDragOver(e, product.id)}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    onMoveUp={(id) => moveProduct(id, -1)}
                    onMoveDown={(id) => moveProduct(id, 1)}
                    onToggleFeatured={toggleFeatured}
                    onToggleStock={toggleOutOfStock}
                    onDelete={handleDeleteProduct}
                  />
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
};

export default AllProducts;
