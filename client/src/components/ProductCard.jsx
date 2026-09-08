import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingCart,
  Minus,
  Plus,
  Trash2,
  Heart,
  PackageCheck,
  PackageX,
  Star,
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { popoverVariants, tapFeedback } from '../lib/motion';
import { inr } from '../lib/currency';
import { productPath } from '../lib/productLinks';
import toast from '../utils/toast';
import ImagePlaceholder from './ImagePlaceholder';

/**
 * Product card. With `compact` it is the full-width rail variant used by the
 * homepage carousels: shorter image panel (8:5), tighter paddings, two-line
 * title and a smaller CTA — while keeping the exact same card identity.
 */
const ProductCard = ({ product, compact = false }) => {
  const { addToCart, cart, updateQuantity, removeFromCart } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();
  const reduced = useReducedMotion();

  const displayPrice = product.discountPrice || product.onlinePrice || product.price || 0;
  const hasDiscount = product.discountPrice && product.discountPrice < product.onlinePrice;
  const discountPercent = hasDiscount
    ? Math.round(((product.onlinePrice - product.discountPrice) / product.onlinePrice) * 100)
    : 0;
  const outOfStock = product.outOfStock === true;
  const wished = isWishlisted(product.id);

  const cartItem = cart.find(item => item.id === product.id);
  const quantityInCart = cartItem ? cartItem.quantity : 0;

  const handleIncrease = (e) => {
    e.stopPropagation();
    if (outOfStock) return;
    updateQuantity(product.id, quantityInCart + 1);
  };

  const handleDecrease = (e) => {
    e.stopPropagation();
    if (quantityInCart > 1) {
      updateQuantity(product.id, quantityInCart - 1);
    } else {
      removeFromCart(product.id);
    }
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    removeFromCart(product.id);
  };

  const handleWishlist = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWishlist(product);
    if (!wished) {
      toast.success(`${product.name} added to wishlist`, { id: `wish-${product.id}` });
    }
  };

  const handleAddToCart = () => {
    if (outOfStock) return;
    addToCart(product);
  };

  const tap = tapFeedback(reduced);
  const morph = popoverVariants(reduced);

  return (
    <div
      className={`group relative flex h-full flex-col overflow-hidden card-premium glass-card ${
        compact ? 'card-compact' : ''
      }`}
    >
      {/* ---------- Image panel ---------- */}
      <div
        className={`product-img-panel glass-img relative w-full flex-shrink-0 ${
          compact ? 'aspect-[8/5]' : 'aspect-square'
        }`}
      >
        <Link
          to={productPath(product)}
          aria-label={product.name}
          className="absolute inset-0 block"
        >
          {product.imageURL ? (
            <img
              src={product.imageURL}
              alt={product.name}
              loading="lazy"
              draggable={false}
              className={`h-full w-full object-contain transition-transform duration-500 ease-out-expo group-hover:scale-[1.07] ${
                compact ? 'p-2.5' : 'p-4 sm:p-5'
              }`}
            />
          ) : (
            <ImagePlaceholder />
          )}
        </Link>

        {/* Inner vignette — gives the panel depth without touching the image */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 50% 0%, transparent 55%, rgba(58, 11, 12, 0.09) 100%)',
          }}
        />

        {hasDiscount && (
          <div
            className={`ribbon tabular pointer-events-none ${compact ? 'ribbon-sm' : ''}`}
            style={{
              background: 'var(--grad-gold)',
              color: 'var(--maroon-900)',
              boxShadow: '0 4px 14px rgba(190, 140, 54, 0.45)',
            }}
          >
            {discountPercent}% OFF
          </div>
        )}

        <button
          onClick={handleWishlist}
          aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'}
          aria-pressed={wished}
          className={`wishlist-btn absolute z-raised flex items-center justify-center rounded-[var(--r-pill)] border shadow-sm ${
            compact ? 'left-2 top-2 h-8 w-8' : 'left-3 top-3 h-11 w-11'
          } ${
            wished
              ? 'border-[color:rgba(255,253,248,0.7)]'
              : 'border-[color:var(--hairline)] hover:border-[color:var(--ember-600)]'
          }`}
          style={
            wished
              ? { background: 'linear-gradient(135deg, #CB2A2A 0%, #AA1F1F 100%)' }
              : { background: 'var(--surface-card)' }
          }
        >
          <Heart
            key={wished ? 'w' : 'u'}
            className={wished ? 'heart-pop fill-current' : ''}
            style={{
              width: compact ? 15 : 18,
              height: compact ? 15 : 18,
              color: wished ? 'var(--white-soft)' : 'var(--text-muted)',
            }}
            strokeWidth={2.2}
          />
        </button>

        {product.brand?.logo && (
          <div
            className={`pointer-events-none absolute left-2 z-raised flex items-center rounded-[var(--r-pill)] border shadow-sm ${
              compact
                ? 'bottom-2 gap-1 py-0.5 pl-1 pr-2'
                : 'bottom-9 gap-1.5 py-1 pl-1.5 pr-2.5'
            }`}
            style={{
              background: 'var(--surface-card)',
              borderColor: 'var(--hairline)',
            }}
          >
            <img
              src={product.brand.logo}
              alt={`${product.brand.name || 'Brand'} logo`}
              loading="lazy"
              className={`shrink-0 rounded-full bg-white object-contain ${
                compact ? 'h-4 w-4' : 'h-5 w-5'
              }`}
              onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
            />
            <span
              className={`truncate font-bold leading-none ${
                compact ? 'text-[9px]' : 'text-[10px]'
              }`}
              style={{ fontFamily: 'var(--font-body)', color: 'var(--text-body)' }}
            >
              {product.brand.name || 'Licensed'}
            </span>
          </div>
        )}
      </div>

      {/* ---------- Body ---------- */}
      <div className={`flex flex-grow flex-col ${compact ? 'p-3' : 'p-3.5 sm:p-4'}`}>
        {/* min-h keeps the tap target at 44px even when the title is short
            enough to sit on a single line. */}
        <Link
          to={productPath(product)}
          className={compact ? 'mt-1 flex items-center' : 'mt-1.5 flex min-h-[44px] items-center'}
        >
          <h3
            className={`card-title product-name line-clamp-2 ${
              compact ? 'text-[13px] leading-snug' : ''
            }`}
            style={{ color: 'var(--text-strong)' }}
          >
            {product.name}
          </h3>
        </Link>

        {(product.rating !== undefined || product.reviewCount !== undefined) && (
          <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${compact ? 'mt-1' : 'mt-1.5'}`}>
            <span className="inline-flex items-center gap-1">
              <Star
                className={`shrink-0 ${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}`}
                style={{ color: 'var(--gold-400)' }}
                fill="currentColor"
                strokeWidth={0}
              />
              <span className={`tabular font-bold ${compact ? 'text-xs' : 'text-[13px]'}`} style={{ color: 'var(--text-strong)' }}>
                {Number(product.rating || 0).toFixed(1)}
              </span>
            </span>
            {product.reviewCount !== undefined && (
              <span className={`tabular ${compact ? 'text-[10px]' : 'text-[11px]'}`} style={{ color: 'var(--text-subtle)' }}>
                ({product.reviewCount} reviews)
              </span>
            )}
          </div>
        )}

        <div className={`flex flex-wrap items-center gap-1.5 ${compact ? 'mt-2' : 'mt-2.5'}`}>
          {outOfStock ? (
            <span className={`badge badge-crimson min-w-0 ${compact ? 'px-2 py-0.5 text-[10px]' : ''}`}>
              <PackageX className={`shrink-0 ${compact ? 'h-3 w-3' : 'hidden h-3.5 w-3.5 sm:inline-block'}`} strokeWidth={2.4} />
              Out of Stock
            </span>
          ) : (
            <span className={`badge badge-leaf min-w-0 ${compact ? 'px-2 py-0.5 text-[10px]' : ''}`}>
              <PackageCheck className={`shrink-0 ${compact ? 'h-3 w-3' : 'hidden h-3.5 w-3.5 sm:inline-block'}`} strokeWidth={2.4} />
              In Stock
            </span>
          )}
        </div>

        <div
          className={`mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t ${
            compact ? 'pt-2' : 'pt-3'
          }`}
          style={{ borderColor: 'var(--hairline)' }}
        >
          <span
            className={`price font-bold leading-none ${
              compact ? 'text-base md:text-lg' : 'text-xl md:text-2xl'
            }`}
            style={{ color: 'var(--ember-600)' }}
          >
            {inr(displayPrice)}
          </span>
          {hasDiscount && (
            <span
              className={`price leading-none line-through ${
                compact ? 'text-xs' : 'text-sm'
              }`}
              style={{ color: 'var(--text-subtle)' }}
            >
              {inr(product.onlinePrice)}
            </span>
          )}
        </div>

        {/* ---------- Add to cart ↔ quantity stepper ----------
            The slot is height-reserved (button ≈44px, stepper+remove ≈94px),
            so switching states never changes the card height or shifts the
            grid row the card sits in. */}
        <div className={`mt-3 flex flex-col justify-center ${compact ? 'min-h-[2.75rem]' : 'min-h-[6rem]'}`}>
          <AnimatePresence mode="wait" initial={false}>
            {quantityInCart === 0 ? (
              <motion.div
                key="add"
                variants={morph}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <motion.button
                  {...tap}
                  onClick={handleAddToCart}
                  disabled={outOfStock}
                  className={`btn-primary w-full px-3 ${
                    compact ? 'min-h-9 text-[12px]' : 'text-[13px] sm:text-sm'
                  }`}
                >
                  {outOfStock ? (
                    <PackageX className={`shrink-0 ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} strokeWidth={2.4} />
                  ) : (
                    <ShoppingCart className={`shrink-0 ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} strokeWidth={2.4} />
                  )}
                  <span className="truncate">{outOfStock ? 'Out of Stock' : 'Add to Cart'}</span>
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key="stepper"
                variants={morph}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <div
                  className="flex items-stretch gap-1 rounded-[var(--r-md)] border p-1"
                  style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline-strong)' }}
                >
                  <motion.button
                    {...tap}
                    onClick={handleDecrease}
                    aria-label={
                      quantityInCart > 1
                        ? `Decrease quantity of ${product.name}`
                        : `Remove ${product.name} from cart`
                    }
                    className={`flex flex-1 items-center justify-center rounded-[10px] border shadow-xs ${
                      compact ? 'min-h-9' : 'min-h-[44px]'
                    }`}
                    style={{
                      background: 'var(--surface-card)',
                      borderColor: 'var(--hairline)',
                      color: 'var(--ember-600)',
                    }}
                  >
                    <Minus className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} strokeWidth={2.6} />
                  </motion.button>

                  <div
                    className={`tabular flex flex-1 items-center justify-center font-bold ${
                      compact ? 'min-h-9 text-sm' : 'min-h-[44px] text-base'
                    }`}
                    style={{ fontFamily: 'var(--font-display)', color: 'var(--text-strong)' }}
                  >
                    {quantityInCart}
                  </div>

                  <motion.button
                    {...tap}
                    onClick={handleIncrease}
                    disabled={outOfStock}
                    aria-label={`Increase quantity of ${product.name}`}
                    className={`flex flex-1 items-center justify-center rounded-[10px] disabled:cursor-not-allowed disabled:opacity-50 ${
                      compact ? 'min-h-9' : 'min-h-[44px]'
                    }`}
                    style={{
                      background: 'var(--grad-ember)',
                      color: '#FFFFFF',
                      boxShadow: 'var(--shadow-ember)',
                    }}
                  >
                    <Plus className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} strokeWidth={2.6} />
                  </motion.button>
                </div>

                <motion.button
                  {...tap}
                  onClick={handleRemove}
                  aria-label={`Remove ${product.name} from cart`}
                  className={`flex w-full items-center justify-center gap-1.5 rounded-[var(--r-md)] border border-[color:var(--hairline)] font-semibold transition-colors hover:border-[color:var(--crimson-600)] hover:bg-[rgba(203,42,42,0.08)] ${
                    compact ? 'mt-1 min-h-8 text-[11px]' : 'mt-1.5 min-h-[44px] text-[12px]'
                  }`}
                  style={{ color: 'var(--crimson-600)', fontFamily: 'var(--font-body)' }}
                >
                  <Trash2 className={`shrink-0 ${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}`} strokeWidth={2.2} />
                  Remove
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;