import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ChevronRight,
  Home,
  Package,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../firebase';
import { categoryDefs } from '../components/home/homeData';
import CategoryIcon from '../components/CategoryIconPack';
import toast from '../utils/toast';
import { pageVariants } from '../lib/motion';

const AdminCategories = () => {
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const snap = await getDocs(collection(db, 'products'));
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      toast.error('Failed to load products');
    }
  };

  const categories = categoryDefs;

  const countInCategory = (cat) => {
    const matchNames = cat.match.map((m) => m.toLowerCase());
    return products.filter((p) => {
      if (Array.isArray(p.categories)) {
        return p.categories.some((c) => matchNames.includes(String(c).toLowerCase()));
      }
      return matchNames.includes(String(p.category || '').toLowerCase());
    }).length;
  };

  const productsInCategory = useMemo(() => {
    if (!selectedCategory) return [];
    const matchNames = selectedCategory.match.map((m) => m.toLowerCase());
    return products.filter((p) => {
      if (Array.isArray(p.categories)) {
        return p.categories.some((c) => matchNames.includes(String(c).toLowerCase()));
      }
      return matchNames.includes(String(p.category || '').toLowerCase());
    });
  }, [products, selectedCategory]);

  const openAddProducts = () => {
    setSelectedProductIds(
      new Set(productsInCategory.map((p) => p.id))
    );
    setSearchQuery('');
    setAddModalOpen(true);
  };

  const toggleProduct = (id) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveCategoryProducts = async () => {
    if (!selectedCategory) return;
    setSaving(true);
    try {
      const categoryName = selectedCategory.match[0];

      const toAdd = products.filter(
        (p) =>
          selectedProductIds.has(p.id) &&
          !productsInCategory.some((ep) => ep.id === p.id)
      );
      const toRemove = productsInCategory.filter(
        (p) => !selectedProductIds.has(p.id)
      );

      const batchOps = [];

      for (const p of toAdd) {
        batchOps.push(
          updateDoc(doc(db, 'products', p.id), {
            categories: arrayUnion(categoryName),
            category: Array.isArray(p.categories) && p.categories.length > 0
              ? p.categories[0]
              : p.category || categoryName,
          })
        );
      }

      for (const p of toRemove) {
        const updates = { categories: arrayRemove(categoryName) };
        if (p.category === categoryName) {
          const remaining = (p.categories || []).filter(
            (c) => String(c).toLowerCase() !== categoryName.toLowerCase()
          );
          updates.category = remaining.length > 0 ? remaining[0] : '';
        }
        batchOps.push(updateDoc(doc(db, 'products', p.id), updates));
      }

      await Promise.all(batchOps);
      await loadProducts();
      toast.success('Category products updated');
      setAddModalOpen(false);
    } catch {
      toast.error('Failed to update category products');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase();
    return products.filter((p) =>
      String(p.name || '').toLowerCase().includes(q)
    );
  }, [products, searchQuery]);

  if (selectedCategory) {
    return (
      <motion.div
        initial="hidden"
        animate="visible"
        variants={pageVariants}
        className="shell-narrow section-pad-sm"
      >
        <div className="mb-4 flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          <Link to="/admin/dashboard" className="inline-flex items-center gap-1 transition-colors hover:underline" style={{ color: 'var(--text-body)' }}>
            <Home className="h-3.5 w-3.5" />
            Admin
          </Link>
          <ChevronRight className="h-3 w-3" />
          <button onClick={() => setSelectedCategory(null)} className="inline-flex items-center gap-1 transition-colors hover:underline" style={{ color: 'var(--text-body)' }}>
            Categories
          </button>
          <ChevronRight className="h-3 w-3" />
          <span style={{ color: 'var(--text-strong)' }}>{selectedCategory.name}</span>
        </div>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedCategory(null)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-sm)] border transition-colors"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--text-body)' }}
              aria-label="Back to categories"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2.5">
              <span className="category-icon-wrap flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden="true">
                <CategoryIcon category={selectedCategory.slug} />
              </span>
              <div>
                <h1 className="text-lg font-bold" style={{ color: 'var(--text-strong)' }}>
                  {selectedCategory.name}
                </h1>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {productsInCategory.length} product{productsInCategory.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </div>
          <button onClick={openAddProducts} className="btn-primary inline-flex items-center gap-2 text-sm">
            <Plus className="h-4 w-4" />
            Add Products
          </button>
        </div>

        {productsInCategory.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-[var(--r-lg)] border py-16 text-center"
            style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
          >
            <Package className="mb-3 h-10 w-10" style={{ color: 'var(--text-muted)' }} />
            <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>No products in this category</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Click "Add Products" to assign products.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {productsInCategory.map((p) => (
              <Link
                key={p.id}
                to={`/admin/edit-product/${p.id}`}
                className="flex items-center gap-3 rounded-[var(--r-md)] border px-3 py-2.5 transition-colors hover:border-[rgba(195,58,20,0.3)]"
                style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
              >
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-[var(--r-sm)] object-cover" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-sm)]" style={{ background: 'var(--surface-sunken)' }}>
                    <Package className="h-5 w-5" style={{ color: 'var(--text-muted)' }} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>{p.name}</p>
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {p.price != null && <span>₹{p.price}</span>}
                    {Array.isArray(p.categories) && p.categories.length > 1 && (
                      <span className="badge badge-gold text-[10px]">{p.categories.length} cats</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
              </Link>
            ))}
          </div>
        )}

        {addModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setAddModalOpen(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-[var(--r-lg)] border"
              style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
            >
              <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--hairline)' }}>
                <div>
                  <h2 className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
                    Add Products to {selectedCategory.name}
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {selectedProductIds.size} selected
                  </p>
                </div>
                <button onClick={() => setAddModalOpen(false)} className="rounded-[var(--r-sm)] p-1.5 transition-colors hover:bg-[rgba(0,0,0,0.05)]" aria-label="Close">
                  <X className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>

              <div className="px-4 pt-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input-premium w-full py-2 pl-8 pr-3 text-sm"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3" style={{ maxHeight: '55vh' }}>
                {filteredProducts.length === 0 ? (
                  <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No products found.</p>
                ) : (
                  <div className="space-y-1">
                    {filteredProducts.map((p) => {
                      const checked = selectedProductIds.has(p.id);
                      return (
                        <label
                          key={p.id}
                          className="flex cursor-pointer items-center gap-3 rounded-[var(--r-sm)] px-3 py-2 transition-colors"
                          style={{
                            background: checked ? 'rgba(195,58,20,0.06)' : 'transparent',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleProduct(p.id)}
                            className="sr-only"
                          />
                          <span
                            aria-hidden="true"
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border transition-colors"
                            style={{
                              background: checked ? 'var(--ember-600)' : 'transparent',
                              borderColor: checked ? 'var(--ember-600)' : 'var(--hairline-strong)',
                            }}
                          >
                            {checked && (
                              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded" style={{ background: 'var(--surface-sunken)' }}>
                              <Package className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                            </div>
                          )}
                          <span className="min-w-0 truncate text-sm font-medium" style={{ color: 'var(--text-strong)' }}>
                            {p.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--hairline)' }}>
                <button onClick={() => setAddModalOpen(false)} className="btn-outline px-4 py-2 text-sm">
                  Cancel
                </button>
                <button onClick={saveCategoryProducts} disabled={saving} className="btn-primary px-4 py-2 text-sm">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={pageVariants}
      className="shell-narrow section-pad-sm"
    >
      <div className="mb-4 flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Link to="/admin/dashboard" className="inline-flex items-center gap-1 transition-colors hover:underline" style={{ color: 'var(--text-body)' }}>
          <Home className="h-3.5 w-3.5" />
          Admin
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span style={{ color: 'var(--text-strong)' }}>Categories</span>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-strong)' }}>Categories</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {categories.length} categories · {products.length} total products
          </p>
        </div>
        <button className="btn-outline inline-flex items-center gap-2 text-sm opacity-50" disabled title="Coming soon">
          <Plus className="h-4 w-4" />
          Add Category
        </button>
      </div>

      <div className="space-y-2">
        {categories.map((cat) => {
          const count = countInCategory(cat);
          return (
            <button
              key={cat.name}
              onClick={() => setSelectedCategory(cat)}
              className="flex w-full items-center gap-3 rounded-[var(--r-md)] border px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-[rgba(195,58,20,0.3)]"
              style={{
                background: 'var(--surface-card)',
                borderColor: 'var(--hairline)',
                boxShadow: 'var(--shadow-xs)',
              }}
            >
              <span className="category-icon-wrap flex h-12 w-12 shrink-0 items-center justify-center" aria-hidden="true">
                <CategoryIcon category={cat.slug} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>{cat.name}</h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {count} product{count !== 1 ? 's' : ''}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
            </button>
          );
        })}
      </div>
    </motion.div>
  );
};

export default AdminCategories;
