import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ChevronRight, Heart, MapPin, Minus, PackageCheck,
  PackageSearch, PackageX, Plus, Share2, ShieldCheck, ShoppingCart, Star, Tag,
  X, ZoomIn,
} from 'lucide-react';
import { db } from '../firebase';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import ImagePlaceholder from '../components/ImagePlaceholder';
import CategoryIcon from '../components/CategoryIconPack';
import { slugForCategory } from '../lib/categoryIcons';
import ProductWatermark from '../components/ProductWatermark';
import QuantityInput from '../components/QuantityInput';
import ProductRail from '../components/product/ProductRail';
import StickyCartBar from '../components/product/StickyCartBar';
import EmptyState from '../components/ui/EmptyState';
import { ProductDetailSkeleton } from '../components/ui/Skeleton';
import { ArchFrame, CornerFiligree } from '../components/ui/Ornaments';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { modalVariants, revealVariants, staggerParent } from '../lib/motion';
import { inr } from '../lib/currency';
import { productPath, slugify } from '../lib/productLinks';
import { trackProductEvent } from '../lib/analytics';
import Seo, { SITE_URL } from '../components/Seo';
import toast from '../utils/toast';

const RECENT_KEY = 'crackers_recently_viewed';

const ProductDetail = () => {
  const { slug: urlSlug } = useParams();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [product, setProduct] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [brandInfo, setBrandInfo] = useState({ name: null, logo: null });
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const { addToCart } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();

  useEffect(() => {
    const handleScroll = () => {
      setShowStickyBar(window.scrollY > 520);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchProduct = async () => {
      const toProduct = (d) => ({ id: d.id, ...d.data() });

      try {
        // Resolution order: canonical slug -> legacy doc id -> historical slug.
        let resolved = null;

        const bySlug = await getDocs(
          query(collection(db, 'products'), where('slug', '==', urlSlug))
        );
        if (!bySlug.empty) resolved = toProduct(bySlug.docs[0]);

        if (!resolved && /^[A-Za-z0-9]{20}$/.test(urlSlug)) {
          const legacySnap = await getDoc(doc(db, 'products', urlSlug));
          if (legacySnap.exists()) resolved = toProduct(legacySnap);
        }

        if (!resolved) {
          try {
            const byOldSlug = await getDocs(
              query(collection(db, 'products'), where('oldSlugs', 'array-contains', urlSlug))
            );
            if (!byOldSlug.empty) resolved = toProduct(byOldSlug.docs[0]);
          } catch (oldSlugError) {
            console.warn('Old-slug lookup unavailable:', oldSlugError.message);
          }
        }

        if (!resolved) return;

        // Redirect non-canonical URLs (legacy ids, old titles) to the current
        // title-based slug so shared links always land on the real URL.
        const canonicalSlug = resolved.slug || slugify(resolved.name) || resolved.id;
        if (canonicalSlug !== urlSlug) {
          navigate(`/product/${canonicalSlug}`, { replace: true });
        }

        const productData = resolved;
        if (cancelled) return;
        setProduct(productData);

        trackProductEvent('PRODUCT_VIEW', {
          productId: productData.id,
          category:
            (Array.isArray(productData.categories) && productData.categories[0]) ||
            productData.category ||
            null,
        });

        const productsSnap = await getDocs(collection(db, 'products'));
        const allProducts = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        let related = [];

        const productBrand = typeof productData.brand === 'string' ? productData.brand : (productData.brand?.name || null);

        const brandsSnap = await getDocs(collection(db, 'brands'));
        const brandsMap = {};
        brandsSnap.docs.forEach(bDoc => {
          const b = { id: bDoc.id, ...bDoc.data() };
          brandsMap[b.name] = b;
        });

        const resolvedBrand = typeof productData.brand === 'string'
          ? { name: productData.brand, logo: brandsMap[productData.brand]?.logo || null }
          : { name: productData.brand?.name || null, logo: productData.brand?.logo || null };

        if (productBrand) {
          related = allProducts.filter(p => {
            const pBrand = typeof p.brand === 'string' ? p.brand : (p.brand?.name || null);
            return p.id !== productData.id && pBrand === productBrand;
          });
        }

        if (related.length < 8) {
          const productCategories = productData.categories || [productData.category];
          const categoryRelated = allProducts.filter(p => {
            if (p.id === productData.id) return false;
            if (related.some(r => r.id === p.id)) return false;
            const pCategories = p.categories || [p.category];
            return pCategories.some(cat => productCategories.includes(cat));
          });
          related = [...related, ...categoryRelated];
        }

        if (related.length < 8) {
          const randomProducts = allProducts
            .filter(p => p.id !== productData.id && !related.some(r => r.id === p.id))
            .sort(() => Math.random() - 0.5);
          related = [...related, ...randomProducts];
        }

        if (cancelled) return;
        setBrandInfo(resolvedBrand);
        setRelatedProducts(related.slice(0, 8));

        try {
          const raw = localStorage.getItem(RECENT_KEY);
          let recent = raw ? JSON.parse(raw) : [];
          recent = [productData, ...recent.filter(p => p && p.id !== productData.id)].slice(0, 8);
          localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
          if (!cancelled) setRecentlyViewed(recent);
        } catch (err) {
          console.error('Failed to update recently viewed:', err);
        }
      } catch (error) {
        console.error('Error fetching product:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProduct();
    setQuantity(1);
    return () => { cancelled = true; };
  }, [urlSlug, navigate]);

  /* Escape closes the zoom lightbox. */
  useEffect(() => {
    if (!zoomOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setZoomOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomOpen]);

  const handleAddToCart = () => {
    addToCart(product, quantity);
  };

  const handleShare = async () => {
    const shareData = {
      title: product.name,
      text: `Check out ${product.name} at Crackers Hyderabad`,
      url: window.location.href
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        toast.success('Product link copied to clipboard');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        toast.error('Could not share this product');
      }
    }
  };

  const handleWishlist = () => {
    toggleWishlist(product);
    if (!isWishlisted(product.id)) {
      toast.success(`${product.name} added to wishlist`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="shell section-pad-sm">
          <ProductDetailSkeleton />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen">
        <div className="shell section-pad">
          <EmptyState
            icon={PackageSearch}
            title="Product not found"
            description="This product is no longer listed, or the link is incorrect. Browse the catalogue to find what you need."
            action={
              <Link to="/products" className="btn-primary">
                <ArrowLeft className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                Back to Products
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const displayPrice = product.discountPrice || product.onlinePrice || product.price;
  const originalPrice = product.onlinePrice || product.price;
  const hasDiscount = product.discountPrice && product.discountPrice < originalPrice;
  const brandName = brandInfo.name || (typeof product.brand === 'string' ? product.brand : (product.brand?.name || null));
  const brandLogo = brandInfo.logo || product.brand?.logo || null;
  const outOfStock = product.outOfStock === true;
  const wished = isWishlisted(product.id);
  const stockLeft = typeof product.stock === 'number' ? product.stock : null;

  const discountPercent = hasDiscount
    ? Math.round(((originalPrice - product.discountPrice) / originalPrice) * 100)
    : 0;

  const categoryList = Array.isArray(product.categories) && product.categories.length
    ? product.categories.filter(Boolean)
    : (product.category ? [product.category] : []);
  const primaryCategory = categoryList[0] || null;

  const crumbLink = 'inline-flex min-h-[44px] items-center transition-colors hover:text-[color:var(--ember-600)]';

  const productUrl = `${SITE_URL}${productPath(product)}`;
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: product.imageURL || undefined,
    description: product.description || undefined,
    brand: { '@type': 'Brand', name: brandInfo.name || 'Crackers Hyderabad' },
    offers: {
      '@type': 'Offer',
      url: productUrl,
      priceCurrency: 'INR',
      price: displayPrice,
      availability: outOfStock
        ? 'https://schema.org/OutOfStock'
        : 'https://schema.org/InStock',
    },
  };

  // Home > Category > Product, mirroring the visible breadcrumb row.
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      ...(primaryCategory
        ? [
            {
              '@type': 'ListItem',
              position: 2,
              name: primaryCategory,
              item: `${SITE_URL}/products?category=${encodeURIComponent(primaryCategory)}`,
            },
          ]
        : []),
      {
        '@type': 'ListItem',
        position: primaryCategory ? 3 : 2,
        name: product.name,
        item: productUrl,
      },
    ],
  };

  return (
    <div className="min-h-screen">
      {product && (
        <Seo
          title={`${product.name} | Crackers Hyderabad`}
          description={(product.description || product.name).slice(0, 155)}
          canonical={productUrl}
          image={product.imageURL || undefined}
          jsonLd={[productJsonLd, breadcrumbJsonLd]}
        />
      )}
      <div className="shell section-pad-sm">
        {/* ============ BREADCRUMB ============ */}
        <Link
          to="/products"
          className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold transition-colors"
          style={{ color: 'var(--maroon-700)' }}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          Back to Products
        </Link>

        <nav aria-label="Breadcrumb" className="mb-6">
          <ol
            className="flex flex-wrap items-center gap-x-2 text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            <li>
              <Link to="/" className={crumbLink}>Home</Link>
            </li>
            <li aria-hidden="true" className="flex items-center">
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.2} />
            </li>
            <li>
              <Link to="/products" className={crumbLink}>Products</Link>
            </li>
            {primaryCategory && (
              <>
                <li aria-hidden="true" className="flex items-center">
                  <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.2} />
                </li>
                <li>
                  <Link
                    to={`/products?category=${encodeURIComponent(primaryCategory)}`}
                    className={crumbLink}
                  >
                    {primaryCategory}
                  </Link>
                </li>
              </>
            )}
            <li aria-hidden="true" className="flex items-center">
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.2} />
            </li>
            <li
              aria-current="page"
              className="min-w-0 truncate font-semibold"
              style={{ color: 'var(--text-strong)' }}
            >
              {product.name}
            </li>
          </ol>
        </nav>

        {/* ============ MAIN PRODUCT ============ */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerParent(reduced, 0.08)}
          className="grid gap-8 lg:grid-cols-2 lg:gap-12"
        >
          {/* ---- Image panel ---- */}
          <motion.div
            variants={revealVariants(reduced, 18)}
            className="lg:sticky lg:top-[86px] lg:self-start"
          >
            <div className="panel-editorial relative" style={{ borderRadius: 'var(--r-xl)' }}>
              <CornerFiligree position="top-left" />
              <CornerFiligree position="bottom-right" />

              <div
                className="product-img-panel group relative isolate aspect-square w-full"
                style={{ borderRadius: 'var(--r-xl) var(--r-xl) 0 0' }}
              >
                <ArchFrame />

                <div className="relative z-raised flex h-full w-full items-center justify-center p-6 sm:p-10">
                  {product.imageURL ? (
                    <img
                      src={product.imageURL}
                      alt={product.name}
                      draggable={false}
                      className="h-full w-full object-contain transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                  ) : (
                    <ImagePlaceholder />
                  )}
                </div>

                {product.imageURL && <ProductWatermark />}

                {outOfStock && (
                  <div className="absolute inset-0 z-overlay flex items-center justify-center bg-white/60 backdrop-blur-[2px] dark:bg-black/45">
                    <span
                      className="inline-flex items-center gap-2 rounded-[var(--r-pill)] px-5 py-2.5 text-sm font-bold text-white"
                      style={{ background: 'var(--crimson-600)', boxShadow: 'var(--shadow-lg)' }}
                    >
                      <PackageX className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
                      Currently Out of Stock
                    </span>
                  </div>
                )}

                {brandLogo && (
                  <div
                    className="absolute bottom-4 left-4 z-overlay flex items-center gap-2 rounded-[var(--r-pill)] py-1.5 pl-1.5 pr-3"
                    style={{
                      background: 'var(--surface-card)',
                      border: '1px solid var(--hairline)',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <img
                      src={brandLogo}
                      alt=""
                      draggable={false}
                      className="h-6 w-6 rounded-full bg-white object-contain"
                      onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
                    />
                    <span className="text-[11px] font-bold" style={{ color: 'var(--text-body)' }}>
                      {brandName}
                    </span>
                  </div>
                )}

                {/* Full-panel zoom trigger — keyboard reachable, no block children. */}
                <button
                  type="button"
                  onClick={() => setZoomOpen(true)}
                  aria-label={`Zoom image of ${product.name}`}
                  className="absolute inset-0 z-modal cursor-zoom-in rounded-[inherit]"
                />
              </div>

              <p
                className="flex items-center justify-center gap-1.5 py-3 text-xs"
                style={{ color: 'var(--text-subtle)' }}
              >
                <ZoomIn className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                Tap the image to zoom
              </p>
            </div>
          </motion.div>

          {/* ---- Buying column ---- */}
          <motion.div variants={revealVariants(reduced, 18)} className="flex flex-col">
            {brandName && (
              <div className="mb-4 flex flex-wrap items-center gap-2.5">
                {brandLogo && (
                  <img
                    src={brandLogo}
                    alt=""
                    draggable={false}
                    className="h-9 w-9 rounded-full bg-white object-contain p-1"
                    style={{ border: '1px solid var(--hairline)' }}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                <span className="text-sm font-semibold" style={{ color: 'var(--text-body)' }}>
                  {brandName}
                </span>
                <span className="badge badge-leaf">Licensed Product</span>
              </div>
            )}

            <div className="flex items-start justify-between gap-3">
              <h1 className="section-title product-name text-balance">{product.name}</h1>
              <button
                type="button"
                onClick={handleWishlist}
                aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'}
                aria-pressed={wished}
                className="wishlist-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: wished ? 'var(--crimson-600)' : 'var(--surface-card)',
                  border: `1px solid ${wished ? 'var(--crimson-600)' : 'var(--hairline-strong)'}`,
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                <Heart
                  key={wished ? 'w' : 'u'}
                  className={`h-5 w-5 ${wished ? 'heart-pop fill-current text-white' : ''}`}
                  style={wished ? undefined : { color: 'var(--text-muted)' }}
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
              </button>
            </div>

            {(product.rating !== undefined || product.reviewCount !== undefined) && (
              <div className="mt-3 flex items-center gap-2">
                <Star
                  className="h-4 w-4 fill-current"
                  style={{ color: 'var(--gold-500)' }}
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
                <span className="tabular text-lg font-bold" style={{ color: 'var(--text-strong)' }}>
                  {Number(product.rating || 0).toFixed(1)}
                </span>
                {product.reviewCount !== undefined && (
                  <span className="tabular text-sm" style={{ color: 'var(--text-muted)' }}>
                    ({product.reviewCount} reviews)
                  </span>
                )}
              </div>
            )}

            {/* Price hierarchy */}
            <div className="mt-6 flex flex-wrap items-end gap-x-4 gap-y-2">
              <span
                className="price"
                style={{
                  fontSize: 'var(--font-section)',
                  fontWeight: 700,
                  lineHeight: 1,
                  color: 'var(--ember-600)',
                }}
              >
                {inr(displayPrice)}
              </span>
              {hasDiscount && (
                <>
                  <span
                    className="price text-lg line-through"
                    style={{ color: 'var(--text-subtle)' }}
                  >
                    {inr(originalPrice)}
                  </span>
                  <span className="badge badge-crimson">
                    <Tag className="h-3 w-3" strokeWidth={2.4} aria-hidden="true" />
                    <span className="tabular">{discountPercent}%</span> off
                  </span>
                </>
              )}
            </div>

            {/* Availability */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {outOfStock ? (
                <span className="badge badge-crimson" style={{ padding: '0.4rem 0.75rem', fontSize: 'var(--font-small)' }}>
                  <PackageX className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  Out of Stock
                </span>
              ) : (
                <span className="badge badge-leaf" style={{ padding: '0.4rem 0.75rem', fontSize: 'var(--font-small)' }}>
                  <PackageCheck className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  {stockLeft !== null && stockLeft <= 10 ? `Only ${stockLeft} left in stock` : 'In Stock'}
                </span>
              )}
              {!outOfStock && (
                <span className="badge badge-neutral" style={{ padding: '0.4rem 0.75rem', fontSize: 'var(--font-small)' }}>
                  Ready to dispatch
                </span>
              )}
            </div>

            {/* Quantity + primary action */}
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <div
                className="flex items-center gap-1 p-1.5"
                style={{
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--hairline-strong)',
                  borderRadius: 'var(--r-lg)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  aria-label="Decrease quantity"
                  className="flex h-11 w-11 items-center justify-center rounded-[var(--r-md)] transition-colors"
                  style={{ color: 'var(--ember-600)' }}
                >
                  <Minus className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
                </button>
                <QuantityInput
                  value={quantity}
                  onChange={setQuantity}
                  ariaLabel="Quantity"
                  className="tabular h-11 w-16 text-center text-lg font-bold focus:outline-none"
                  style={{
                    fontFamily: 'var(--font-display)',
                    color: 'var(--ember-600)',
                    background: 'var(--surface-card)',
                    border: '1px solid var(--hairline-strong)',
                    borderRadius: 'var(--r-md)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  aria-label="Increase quantity"
                  className="flex h-11 w-11 items-center justify-center rounded-[var(--r-md)] transition-colors"
                  style={{ color: 'var(--ember-600)' }}
                >
                  <Plus className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleAddToCart}
                disabled={outOfStock}
                className="btn-primary btn-shine min-w-[11rem] flex-1"
              >
                <ShoppingCart className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
                {outOfStock ? 'Out of Stock' : 'Add to Cart'}
              </button>

              <button
                type="button"
                onClick={handleShare}
                aria-label="Share this product"
                className="arrow-btn shrink-0"
              >
                <Share2 className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>

            {/* ---- Details ---- */}
            <div className="mt-9 space-y-7">
              {product.description && (
                <section aria-labelledby="product-description">
                  <h2 id="product-description" className="label-caps">Description</h2>
                  <p
                    className="text-pretty mt-2.5 whitespace-pre-line leading-relaxed"
                    style={{ color: 'var(--text-body)' }}
                  >
                    {product.description}
                  </p>
                </section>
              )}

              {categoryList.length > 0 && (
                <section aria-labelledby="product-categories">
                  <h2 id="product-categories" className="label-caps">Categories</h2>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {categoryList.map((cat) => (
                      <Link
                        key={cat}
                        to={`/products?category=${encodeURIComponent(cat)}`}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--r-pill)] px-3.5 text-sm font-semibold transition-transform duration-200 ease-out hover:-translate-y-0.5"
                        style={{
                          background: 'var(--surface-card)',
                          border: '1px solid var(--hairline-strong)',
                          color: 'var(--text-body)',
                        }}
                      >
                        <span className="h-4 w-4 shrink-0" aria-hidden="true">
                          <CategoryIcon category={slugForCategory(cat)} />
                        </span>
                        {cat}
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              <section aria-labelledby="product-assurances">
                <h2 id="product-assurances" className="label-caps">Delivery and packaging</h2>
                <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    { Icon: MapPin, title: '2-3 Days', note: 'We deliver in Hyderabad', tint: 'rgba(44, 122, 83, 0.12)', color: 'var(--leaf-600)' },
                    { Icon: ShieldCheck, title: 'Safe Packaging', note: 'COD Available', tint: 'rgba(210, 166, 79, 0.16)', color: 'var(--gold-600)' },
                  ].map(({ Icon, title, note, tint, color }) => (
                    <div
                      key={title}
                      className="flex items-center gap-2.5 p-3"
                      style={{
                        background: 'var(--surface-raised)',
                        border: '1px solid var(--hairline)',
                        borderRadius: 'var(--r-lg)',
                      }}
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-md)]"
                        style={{ background: tint }}
                      >
                        <Icon className="h-[18px] w-[18px]" style={{ color }} strokeWidth={2.2} aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span
                          className="block text-xs font-bold"
                          style={{ fontFamily: 'var(--font-display)', color: 'var(--text-strong)' }}
                        >
                          {title}
                        </span>
                        <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {note}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </motion.div>
        </motion.div>

        {/* ============ RELATED PRODUCTS ============ */}
        {relatedProducts.length > 0 && (
          <ProductRail
            headingId="related-products"
            eyebrow="More like this"
            title="Related Products"
            items={relatedProducts}
            reduced={reduced}
          />
        )}

        {/* ============ RECENTLY VIEWED ============ */}
        {recentlyViewed.length > 1 && (
          <ProductRail
            headingId="recently-viewed"
            eyebrow="Your trail"
            title="Recently Viewed"
            items={recentlyViewed.slice(0, 6)}
            reduced={reduced}
          />
        )}
      </div>

      {/* ============ STICKY ADD TO CART BAR ============ */}
      <StickyCartBar
        product={product}
        displayPrice={displayPrice}
        outOfStock={outOfStock}
        quantity={quantity}
        setQuantity={setQuantity}
        onAddToCart={handleAddToCart}
        visible={showStickyBar}
      />

      {/* ============ ZOOM LIGHTBOX ============ */}
      <AnimatePresence>
        {zoomOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.001 : 0.18 }}
            role="dialog"
            aria-modal="true"
            aria-label={`${product.name} — enlarged image`}
            className="fixed inset-0 z-modal flex cursor-zoom-out items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
            onClick={() => setZoomOpen(false)}
          >
            <button
              type="button"
              onClick={() => setZoomOpen(false)}
              aria-label="Close zoom"
              className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <X className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
            </button>

            {product.imageURL ? (
              <motion.img
                variants={modalVariants(reduced)}
                initial="hidden"
                animate="visible"
                exit="exit"
                src={product.imageURL}
                alt={product.name}
                draggable={false}
                className="max-h-full max-w-full rounded-[var(--r-xl)] object-contain"
              />
            ) : (
              <div className="h-64 w-64">
                <ImagePlaceholder />
              </div>
            )}

            {product.imageURL && <ProductWatermark className="bottom-6 right-6" />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProductDetail;
