import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, PackageSearch, LoaderCircle, ShoppingBag, ArrowDownWideNarrow } from 'lucide-react';
import { revealVariants } from '../../lib/motion';
import { REGISTER_PANEL } from './surfaces';
import { displayNameForCategory } from '../../lib/categoryIcons';

const CATEGORIES = [
  'Rockets',
  'Sparkles',
  'Ground Chakkars',
  'Sky Shots',
  'Gift Boxes',
  'Flower Pots',
  'Bombs',
  'Garlands',
  'Kids Special',
  'Guns, Rolls & Pop Pop',
  'Threads and Novelties',
];

const SORT_OPTIONS = [
  { key: 'name', label: 'Name A–Z' },
  { key: 'price-asc', label: 'Price: low → high' },
  { key: 'price-desc', label: 'Price: high → low' },
];

const unitPriceOf = (product) =>
  product.offlineDiscountPrice || product.offlineMRP || product.offlinePrice || product.onlinePrice || 0;

const mrpOf = (product) => product.offlineMRP || product.offlinePrice || product.onlinePrice || 0;

/**
 * Left-hand catalogue of the billing workspace (40% column).
 *
 * Compact product grid with category filter chips, sort control and live
 * count. Purely a picker — it owns no product state and no pricing rules.
 */
const ProductPickerPanel = ({
  products,
  loading,
  searchQuery,
  onAdd,
  reduced,
  totalCount,
}) => {
  const [category, setCategory] = useState('All');
  const [sortKey, setSortKey] = useState('name');

  const filtered = products.filter((product) => {
    if (category === 'All') return true;
    const cats = product.categories && product.categories.length ? product.categories : [product.category];
    return cats.includes(category);
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'price-asc') return unitPriceOf(a) - unitPriceOf(b);
    if (sortKey === 'price-desc') return unitPriceOf(b) - unitPriceOf(a);
    return (a.name || '').localeCompare(b.name || '');
  });

  return (
    <motion.section
      aria-labelledby="catalogue-heading"
      initial="hidden"
      animate="visible"
      variants={revealVariants(reduced, 14)}
      className="flex h-full min-h-0 flex-col"
      style={REGISTER_PANEL}
    >
      {/* Pane header */}
      <div
        className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2.5"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <h2
          id="catalogue-heading"
          className="flex min-w-0 items-center gap-2 text-sm font-bold"
          style={{ color: 'var(--text-strong)' }}
        >
          <ShoppingBag className="h-4 w-4 shrink-0" style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
          <span className="truncate">Products</span>
        </h2>
        <span className="badge badge-neutral tabular shrink-0">
          {loading ? '…' : `${sorted.length} / ${totalCount}`}
        </span>
      </div>

      {/* Category chips + sort */}
      <div
        className="flex shrink-0 flex-col gap-2 border-b px-3 py-2.5"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <div className="flex items-center gap-2">
          <div className="relative shrink-0">
            <ArrowDownWideNarrow
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
              style={{ color: 'var(--text-subtle)' }}
              aria-hidden="true"
            />
            <label htmlFor="product-sort" className="sr-only">
              Sort products
            </label>
            <select
              id="product-sort"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              className="input-premium h-9 appearance-none pl-8 pr-7 text-xs font-semibold"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2"
              style={{ color: 'var(--text-subtle)' }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
          <span className="tabular text-[0.6875rem] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            {searchQuery ? `${sorted.length} match${sorted.length === 1 ? '' : 'es'}` : 'All products'}
          </span>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Filter by category">
          {['All', ...CATEGORIES].map((cat) => {
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(cat)}
                className={`pos-chip shrink-0 rounded-full px-3 py-1 text-[0.6875rem] font-bold uppercase tracking-wider ${active ? 'pos-chip-active' : ''}`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Product grid */}
      <div className="pos-pane min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col items-center gap-3 py-16">
            <LoaderCircle className="h-6 w-6 animate-spin" style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Loading products
            </span>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <PackageSearch className="h-7 w-7" style={{ color: 'var(--text-subtle)' }} strokeWidth={1.6} aria-hidden="true" />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-body)' }}>
              No products found
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Try a different name, category or search
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {sorted.map((product) => {
              const price = unitPriceOf(product);
              const mrp = mrpOf(product);
              const hasDiscount = product.offlineDiscountPrice && product.offlineDiscountPrice < mrp;
              const cats = product.categories && product.categories.length ? product.categories : [product.category];
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onAdd(product)}
                  disabled={product.outOfStock}
                  aria-label={product.outOfStock ? `${product.name} — out of stock` : `Add ${product.name} to bill`}
                  className={`pos-product-card flex min-w-0 flex-col rounded-[var(--r-md)] p-2 text-left ${product.outOfStock ? 'is-dim cursor-not-allowed' : ''}`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {product.imageURL ? (
                      <img
                        src={product.imageURL}
                        alt=""
                        width="36"
                        height="36"
                        loading="lazy"
                        className="h-9 w-9 shrink-0 rounded-[var(--r-sm)] object-contain p-0.5"
                        style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}
                      />
                    ) : (
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[0.625rem] font-bold uppercase"
                        style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)', color: 'var(--text-subtle)' }}
                      >
                        {cats[0]?.slice(0, 1) || '?'}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs font-semibold leading-snug" style={{ color: 'var(--text-strong)' }}>
                        {product.name}
                      </p>
                      <p className="mt-0.5 truncate text-[0.625rem] font-medium" style={{ color: 'var(--text-muted)' }}>
                        {cats.map(displayNameForCategory).join(', ')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 flex items-end justify-between gap-1.5">
                    <div className="min-w-0">
                      {hasDiscount ? (
                        <>
                          <span className="tabular block truncate text-sm font-bold" style={{ color: 'var(--leaf-600)' }}>
                            ₹{price}
                          </span>
                          <span className="tabular block text-[0.625rem] line-through" style={{ color: 'var(--text-subtle)' }}>
                            ₹{mrp}
                          </span>
                        </>
                      ) : (
                        <span className="tabular block truncate text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
                          ₹{price}
                        </span>
                      )}
                      {product.outOfStock && <span className="badge badge-crimson mt-0.5">Out of stock</span>}
                    </div>
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--r-sm)] transition-colors"
                      style={{
                        background: 'rgba(255, 107, 61, 0.14)',
                        color: 'var(--ember-500)',
                      }}
                      aria-hidden="true"
                    >
                      <Plus className="h-4 w-4" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </motion.section>
  );
};

export default ProductPickerPanel;