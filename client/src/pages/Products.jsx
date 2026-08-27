import { useEffect, useRef, useState } from 'react';
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import {
  Check, GripVertical,
  PackageSearch, RotateCcw, Search, SearchX,
  X,
} from 'lucide-react';
import { db } from '../firebase';
import ProductCard from '../components/ProductCard';
import CategoryIcon from '../components/CategoryIconPack';
import EmptyState from '../components/ui/EmptyState';
import { ProductGridSkeleton } from '../components/ui/Skeleton';
import { RangoliDivider } from '../components/ui/Ornaments';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { DURATION, EASE_OUT_EXPO, SPRING, revealVariants } from '../lib/motion';
import { useAuth } from '../context/AuthContext';
import Seo from '../components/Seo';
import toast from '../utils/toast';

/* Category order is unchanged — customers navigate by position. */
const categories = [
  { name: 'Rockets', slug: 'rockets' },
  { name: 'Sparkles', slug: 'sparkles' },
  { name: 'Ground Chakkars', slug: 'ground-chakkars' },
  { name: 'Fancy Fireworks', slug: 'fancy' },
  { name: 'Gift Boxes', slug: 'gift-boxes' },
  { name: 'Flower Pots', slug: 'flower-pots' },
  { name: 'Bombs', slug: 'bombs' },
  { name: 'Garlands', slug: 'garlands' },
  { name: 'Kids Special', slug: 'kids' },
  { name: 'Guns, Rolls & Pop Pop', slug: 'guns-rolls-pop-pop' },
  { name: 'Threads and Novelties', slug: 'threads-novelties' },
];

const pillBase =
  'inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-[var(--r-pill)] px-3.5 ' +
  'text-[0.8125rem] leading-none transition-transform duration-200 ease-out ' +
  'hover:-translate-y-0.5 focus-visible:-translate-y-0.5';

const pillStyle = (active) =>
  active
    ? {
        background: 'var(--grad-maroon)',
        color: '#FFFFFF',
        border: '1px solid rgba(210, 166, 79, 0.55)',
        boxShadow: 'var(--shadow-sm)',
        fontWeight: 700,
      }
    : {
        background: 'var(--surface-card)',
        color: 'var(--text-body)',
        border: '1px solid var(--hairline-strong)',
        fontWeight: 600,
      };

const Products = () => {
  const reduced = useReducedMotion();
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const [reorderMode, setReorderMode] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'products'));
        const productsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setProducts(productsData);
        setFilteredProducts(productsData);
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  useEffect(() => {
    const categoryParam = searchParams.get('category');
    if (categoryParam) {
      setSelectedCategory(categoryParam);
    }
    const qParam = searchParams.get('q');
    if (qParam) {
      setSearchTerm(qParam);
    }
  }, [searchParams]);

  useEffect(() => {
    let filtered = products;

    if (selectedCategory !== 'All') {
      const wanted = selectedCategory.toLowerCase();
      filtered = filtered.filter(p => {
        if (Array.isArray(p.categories)) {
          return p.categories.some(cat => String(cat).toLowerCase() === wanted);
        }
        return String(p.category || '').toLowerCase() === wanted;
      });
    }

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(p => {
        const nameMatch = (p.name || '').toLowerCase().includes(searchLower);
        const descMatch = String(p.description || '').toLowerCase().includes(searchLower);
        const categoryMatch = Array.isArray(p.categories)
          ? p.categories.some(cat => String(cat).toLowerCase().includes(searchLower))
          : String(p.category || '').toLowerCase().includes(searchLower);

        return nameMatch || descMatch || categoryMatch;
      });
    }

    filtered = [...filtered].sort((a, b) =>
      (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || (a.name || '').localeCompare(b.name || '')
    );

    setFilteredProducts(filtered);
  }, [searchTerm, products, selectedCategory]);

  const sortByOrder = (list) =>
    [...list].sort((a, b) =>
      (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || (a.name || '').localeCompare(b.name || '')
    );

  const handleDragStart = (e, productId) => {
    if (!reorderMode) return;
    setDragId(productId);
    dirtyRef.current = false;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', productId);
  };

  const reorderInMemory = (targetId) => {
    if (!dragId || dragId === targetId) return;
    const list = sortByOrder(products);
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
    if (!reorderMode || !dragId) return;
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
      const list = sortByOrder(products);
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

  /* Same semantics as the "All Products" pill, plus clearing the search box. */
  const resetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('All');
    setSearchParams({});
  };

  const hasActiveFilters = Boolean(searchTerm) || selectedCategory !== 'All';

  let emptyTitle = 'No products listed yet';
  let emptyDescription = 'The catalogue is empty right now. Please check back shortly.';
  if (searchTerm) {
    emptyTitle = 'No products match that search';
    emptyDescription =
      selectedCategory === 'All'
        ? `Nothing matched “${searchTerm}”. Try a shorter word, or reset the filters to browse the whole range.`
        : `Nothing matched “${searchTerm}” in ${selectedCategory}. Try a shorter word, or reset the filters to browse the whole range.`;
  } else if (selectedCategory !== 'All') {
    emptyTitle = `Nothing in ${selectedCategory} right now`;
    emptyDescription = 'This category has no products listed at the moment. Reset the filters to browse the full catalogue.';
  }

  return (
    <div className="min-h-screen">
      <Seo
        title="Buy Crackers Online in Hyderabad | Wholesale Fireworks – Crackers Hyderabad"
        description="Shop premium fireworks and wholesale crackers in Hyderabad. Gift boxes, sparkles, rockets, flower pots and festival collections with doorstep delivery."
        canonical={selectedCategory !== 'All' ? `/products?category=${encodeURIComponent(selectedCategory)}` : '/products'}
      />
      <div className="shell section-pad-sm">
        {/* ============ EDITORIAL HEADER ============ */}
        <motion.header
          initial="hidden"
          animate="visible"
          variants={revealVariants(reduced, 18)}
          className="text-center"
        >
          <span className="section-eyebrow justify-center">Catalogue</span>
          <h1 className="section-title mt-3 text-balance">Our Products</h1>
          <p
            className="mx-auto mt-4 max-w-prose text-pretty text-base"
            style={{ color: 'var(--text-muted)' }}
          >
            Bulk festival stock for retailers. Browse the full range, filter by category
            and build your order.
          </p>
          <RangoliDivider className="mx-auto mt-8 max-w-sm" />
        </motion.header>

        {/* ============ FILTER BAR ============ */}
        <div className="mt-10">
          <div
            className="glass-strong-util p-3 sm:p-4"
            style={{ borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-md)' }}
          >
            {/* Search + result count + admin ordering */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <label htmlFor="product-search" className="sr-only">
                  Search products
                </label>
                <Search
                  aria-hidden="true"
                  strokeWidth={2.2}
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: 'var(--gold-600)' }}
                />
                <input
                  id="product-search"
                  type="text"
                  placeholder="Search products, categories, descriptions"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-premium pl-11 pr-14"
                  style={{ borderRadius: 'var(--r-pill)' }}
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    aria-label="Clear search"
                    className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X className="h-4 w-4" strokeWidth={2.4} />
                  </button>
                )}
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setReorderMode(!reorderMode);
                    setDragId(null);
                    setDragOverId(null);
                  }}
                  aria-pressed={reorderMode}
                  className={
                    reorderMode
                      ? 'inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-[var(--r-md)] px-4 text-sm font-semibold text-white'
                      : 'btn-outline shrink-0 text-sm'
                  }
                  style={reorderMode ? { background: 'var(--leaf-600)', boxShadow: 'var(--shadow-sm)' } : undefined}
                >
                  {reorderMode ? (
                    <>
                      <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                      Done Reordering
                    </>
                  ) : (
                    <>
                      <GripVertical className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                      Reorder Products
                    </>
                  )}
                </button>
              )}
            </div>

            <hr className="rule-gold my-3" />

            {/* Category filter — URL driven */}
            <div
              role="group"
              aria-label="Filter products by category"
              className="scroll-x flex gap-2 py-1"
            >
              {categories.map((category) => {
                const isSelected = selectedCategory === category.name;
                return (
                  <button
                    key={category.name}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(category.name);
                      setSearchParams({ category: category.name });
                    }}
                    aria-pressed={isSelected}
                    className={pillBase}
                    style={pillStyle(isSelected)}
                  >
                    <span className="h-4 w-4 shrink-0" aria-hidden="true">
                      <CategoryIcon category={category.slug} />
                    </span>
                    <span className="whitespace-nowrap">{category.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Space is reserved whenever an admin can toggle the mode, so
                entering/exiting reorder mode never shifts the grid below. */}
            {(reorderMode || isAdmin) && (
              <p
                className="mt-3 rounded-[var(--r-md)] px-3.5 py-2.5 text-xs font-semibold"
                style={{
                  background: 'rgba(210, 166, 79, 0.14)',
                  border: '1px solid rgba(210, 166, 79, 0.4)',
                  color: 'var(--gold-600)',
                  visibility: reorderMode ? 'visible' : 'hidden',
                }}
              >
                Drag product cards to rearrange — customers see this exact order
              </p>
            )}
          </div>
        </div>

        {/* ============ GRID ============ */}
        <div className="mt-10">
          {loading ? (
            <ProductGridSkeleton count={8} />
          ) : filteredProducts.length === 0 ? (
            <EmptyState
              icon={searchTerm ? SearchX : PackageSearch}
              title={emptyTitle}
              description={emptyDescription}
              action={
                hasActiveFilters ? (
                  <button type="button" onClick={resetFilters} className="btn-primary">
                    <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                    Reset filters
                  </button>
                ) : null
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
              {filteredProducts.map((product, index) => (
                <motion.div
                  key={product.id}
                  layout={!reduced}
                  initial={reduced ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    layout: SPRING.snappy,
                    opacity: { duration: reduced ? 0.001 : DURATION.base },
                    y: { duration: reduced ? 0.001 : DURATION.base, ease: EASE_OUT_EXPO },
                    delay: reduced ? 0 : Math.min(index, 11) * 0.035,
                  }}
                  onDragOver={(e) => handleDragOver(e, product.id)}
                  onDrop={handleDrop}
                  className={`relative ${
                    dragId === product.id
                      ? 'z-overlay scale-95 opacity-50'
                      : dragOverId === product.id
                        ? 'z-nav'
                        : ''
                  }`}
                >
                  {reorderMode && (
                    <span
                      draggable
                      onDragStart={(e) => handleDragStart(e, product.id)}
                      onDragEnd={handleDragEnd}
                      title="Drag to reorder"
                      aria-label={`Reorder product number ${sortByOrder(products).findIndex(p => p.id === product.id) + 1}`}
                      className="absolute -left-2 -top-2 z-modal flex h-9 w-9 cursor-grab items-center justify-center gap-0.5 rounded-full text-xs font-bold active:cursor-grabbing"
                      style={{
                        background: 'var(--grad-gold)',
                        color: 'var(--maroon-900)',
                        boxShadow: 'var(--shadow-gold)',
                      }}
                    >
                      <GripVertical className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
                      {sortByOrder(products).findIndex(p => p.id === product.id) + 1}
                    </span>
                  )}
                  <ProductCard product={product} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Products;
