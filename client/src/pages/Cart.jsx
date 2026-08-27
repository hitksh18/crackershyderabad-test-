import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Trash2, Minus, Plus, ShoppingBag, Truck, ArrowRight, PackageSearch } from 'lucide-react';
import { useCart } from '../context/CartContext';
import QuantityInput from '../components/QuantityInput';
import ImagePlaceholder from '../components/ImagePlaceholder';
import EmptyState from '../components/ui/EmptyState';
import { CornerFiligree } from '../components/ui/Ornaments';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { inr } from '../lib/currency';
import {
  revealVariants,
  staggerParent,
  DURATION,
  EASE_OUT_EXPO,
  EASE_IN_SOFT,
} from '../lib/motion';
import Seo from '../components/Seo';

const FREE_SHIPPING_THRESHOLD = 2500;

const unitPriceOf = (item) => item.discountPrice || item.onlinePrice || item.price || 0;

/** Line item: slides in on mount, slides out on removal. Transform + opacity only. */
const rowVariants = (reduced) => ({
  hidden: { opacity: 0, y: reduced ? 0 : 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: reduced ? 0.001 : DURATION.base, ease: EASE_OUT_EXPO },
  },
  exit: {
    opacity: 0,
    x: reduced ? 0 : -18,
    transition: { duration: reduced ? 0.001 : DURATION.fast, ease: EASE_IN_SOFT },
  },
});

/** The amount ticks over whenever the quantity changes. */
const amountVariants = (reduced) => ({
  hidden: { opacity: 0, y: reduced ? 0 : 7 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: reduced ? 0.001 : DURATION.fast, ease: EASE_OUT_EXPO },
  },
  exit: {
    opacity: 0,
    y: reduced ? 0 : -7,
    transition: { duration: reduced ? 0.001 : DURATION.instant, ease: EASE_IN_SOFT },
  },
});

const Cart = () => {
  const reduced = useReducedMotion();
  const { cart, hydrated, removeFromCart, updateQuantity, getCartTotal } = useCart();
  const total = getCartTotal();

  /* Before the cart is read from storage it is indistinguishable from an empty
     one, and "Your cart is empty" flashed on every refresh of a full cart. */
  if (!hydrated) {
    return (
      <div className="min-h-screen section-pad-sm" role="status" aria-live="polite" aria-busy="true">
        <Seo title="Your Cart | Crackers Hyderabad" noindex />
        <div className="shell-narrow flex justify-center py-24">
          <div
            className="h-14 w-14 animate-spin rounded-full"
            style={{ border: '3px solid var(--hairline-strong)', borderTopColor: 'var(--ember-600)' }}
          />
          <span className="sr-only">Loading your cart</span>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-screen section-pad-sm">
        <Seo title="Your Cart | Crackers Hyderabad" noindex />
        <div className="shell-narrow">
          <EmptyState
            icon={ShoppingBag}
            title="Your cart is empty"
            description="Celebrations are better with crackers — start shopping!"
            action={
              <Link to="/products" className="btn-primary btn-shine w-full sm:w-auto">
                Continue shopping
                <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              </Link>
            }
            secondaryAction={
              <Link to="/track-order" className="btn-outline w-full sm:w-auto">
                <PackageSearch className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                Track an order
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const remaining = FREE_SHIPPING_THRESHOLD - total;
  const progress = Math.min(100, (total / FREE_SHIPPING_THRESHOLD) * 100);

  return (
    <div className="min-h-screen section-pad-sm pb-28 lg:pb-0">
      <Seo title="Your Cart | Crackers Hyderabad" noindex />
      <div className="shell">
        <motion.header
          initial="hidden"
          animate="visible"
          variants={revealVariants(reduced, 14)}
          className="mb-8 md:mb-10"
        >
          <span className="section-eyebrow">Your selection</span>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <h1 className="section-title">Shopping Cart</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              <span className="tabular font-semibold" style={{ color: 'var(--text-strong)' }}>
                {cart.length}
              </span>{' '}
              {cart.length === 1 ? 'item' : 'items'} · Total{' '}
              <span className="price font-semibold" style={{ color: 'var(--text-strong)' }}>
                {inr(total)}
              </span>
            </p>
          </div>
        </motion.header>

        <div className="grid items-start gap-6 lg:grid-cols-12 lg:gap-8">
          {/* ---- Line items ---- */}
          <section className="min-w-0 lg:col-span-7 xl:col-span-8" aria-label="Cart line items">
            <div className="panel-editorial">
              <div
                className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6"
                style={{ borderBottom: '1px solid var(--hairline)' }}
              >
                <span className="label-caps">Item</span>
                <span className="label-caps">Amount</span>
              </div>

              <motion.ul
                initial="hidden"
                animate="visible"
                variants={staggerParent(reduced, 0.05)}
                className="list-none"
              >
                <AnimatePresence>
                  {cart.map((item, index) => {
                    const unit = unitPriceOf(item);

                    return (
                      <motion.li
                        key={item.id}
                        layout={!reduced}
                        variants={rowVariants(reduced)}
                        exit="exit"
                        className="px-4 py-4 sm:px-6 sm:py-5"
                        style={{ borderTop: index === 0 ? 'none' : '1px solid var(--hairline)' }}
                      >
                        <div className="flex gap-3 sm:gap-5">
                          <div
                            className="product-img-panel h-20 w-20 shrink-0 overflow-hidden sm:h-24 sm:w-24"
                            style={{ borderRadius: 'var(--r-md)', border: '1px solid var(--hairline)' }}
                          >
                            {item.imageURL ? (
                              <img
                                src={item.imageURL}
                                alt={item.name}
                                loading="lazy"
                                className="h-full w-full object-contain p-1.5"
                              />
                            ) : (
                              <ImagePlaceholder compact />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h2 className="card-title product-name line-clamp-2" style={{ color: 'var(--text-strong)' }}>
                                  {item.name}
                                </h2>
                                {item.category && <p className="label-caps mt-1">{item.category}</p>}
                              </div>

                              <button
                                type="button"
                                onClick={() => removeFromCart(item.id)}
                                aria-label={`Remove ${item.name} from cart`}
                                className="-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-vermilion-50 dark:hover:bg-white/5"
                                style={{ color: 'var(--crimson-600)' }}
                              >
                                <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.2} />
                              </button>
                            </div>

                            <p className="price mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                              {inr(unit)} <span style={{ color: 'var(--text-subtle)' }}>each</span>
                            </p>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                              <div
                                className="inline-flex items-center"
                                style={{
                                  border: '1px solid var(--hairline-strong)',
                                  borderRadius: 'var(--r-pill)',
                                  background: 'var(--surface-card)',
                                }}
                              >
                                <motion.button
                                  type="button"
                                  whileTap={reduced ? undefined : { scale: 0.9 }}
                                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                  aria-label={`Decrease quantity of ${item.name}`}
                                  className="inline-flex h-11 w-11 items-center justify-center rounded-full"
                                >
                                  <Minus className="h-4 w-4" strokeWidth={2.6} style={{ color: 'var(--maroon-700)' }} />
                                </motion.button>

                                <QuantityInput
                                  value={item.quantity}
                                  onChange={(quantity) => updateQuantity(item.id, quantity)}
                                  ariaLabel={`Quantity for ${item.name}`}
                                  className="tabular h-11 w-12 border-0 bg-transparent text-center text-base font-bold focus:outline-none"
                                  style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}
                                />

                                <motion.button
                                  type="button"
                                  whileTap={reduced ? undefined : { scale: 0.9 }}
                                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                  aria-label={`Increase quantity of ${item.name}`}
                                  className="inline-flex h-11 w-11 items-center justify-center rounded-full"
                                >
                                  <Plus className="h-4 w-4" strokeWidth={2.6} style={{ color: 'var(--maroon-700)' }} />
                                </motion.button>
                              </div>

                              <AnimatePresence mode="wait" initial={false}>
                                <motion.p
                                  key={item.quantity}
                                  variants={amountVariants(reduced)}
                                  initial="hidden"
                                  animate="visible"
                                  exit="exit"
                                  className="price ml-auto text-base font-bold sm:text-lg"
                                  style={{ color: 'var(--ember-600)' }}
                                >
                                  {inr(unit * item.quantity)}
                                </motion.p>
                              </AnimatePresence>
                            </div>
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </motion.ul>
            </div>
          </section>

          {/* ---- Sticky summary (desktop only; mobile gets the bottom bar) ---- */}
          <aside className="hidden min-w-0 space-y-4 lg:sticky lg:top-24 lg:col-span-5 lg:block xl:col-span-4" aria-label="Order summary">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={revealVariants(reduced, 12)}
              className="panel-editorial p-4 sm:p-5"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ background: 'rgba(210, 166, 79, 0.14)', border: '1px solid rgba(190, 140, 54, 0.32)' }}
                >
                  <Truck className="h-4 w-4" strokeWidth={2.2} style={{ color: 'var(--gold-600)' }} />
                </span>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                  {total >= FREE_SHIPPING_THRESHOLD
                    ? "You've unlocked FREE SHIPPING & COD!"
                    : `Add ₹${remaining.toLocaleString('en-IN')} more for FREE SHIPPING & COD`}
                </p>
              </div>

              <div
                aria-hidden="true"
                className="mt-4 h-2 overflow-hidden rounded-full"
                style={{ background: 'var(--surface-sunken)' }}
              >
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: progress / 100 }}
                  transition={{ duration: reduced ? 0.001 : DURATION.slow, ease: EASE_OUT_EXPO }}
                  className="h-full w-full origin-left rounded-full"
                  style={{ background: 'var(--grad-gold)' }}
                />
              </div>
            </motion.div>

            <motion.div
              initial="hidden"
              animate="visible"
              variants={revealVariants(reduced, 12)}
              className="panel-editorial relative p-5 sm:p-6"
            >
              <CornerFiligree position="top-right" />

              <h2 className="subsection-title" style={{ color: 'var(--text-strong)' }}>
                Order Summary
              </h2>
              <hr className="rule-gold my-4" />

              <ul className="space-y-2.5">
                <AnimatePresence>
                  {cart.map((item) => (
                    <motion.li
                      key={item.id}
                      layout={!reduced}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reduced ? 0.001 : DURATION.fast }}
                      className="flex items-baseline justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 truncate" style={{ color: 'var(--text-muted)' }}>
                        {item.name} <span className="tabular">x {item.quantity}</span>
                      </span>
                      <span className="price shrink-0 font-semibold" style={{ color: 'var(--text-body)' }}>
                        {inr(unitPriceOf(item) * item.quantity)}
                      </span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>

              <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--hairline)' }}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="label-caps">Total</span>
                  <span
                    className="price text-2xl font-bold"
                    style={{ color: 'var(--text-strong)' }}
                  >
                    {inr(getCartTotal())}
                  </span>
                </div>

                <div className="mt-5 space-y-3">
                  <Link to="/checkout" className="btn-primary btn-shine w-full">
                    Proceed to Checkout
                    <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  </Link>
                  <Link to="/products" className="btn-outline w-full">
                    Add More Products
                  </Link>
                </div>
              </div>
            </motion.div>
          </aside>
        </div>
      </div>

      {/* ---- Mobile sticky checkout bar ----
          Always visible while scrolling so checkout never requires scrolling
          to the bottom of the line-item list. Desktop uses the sticky aside. */}
      <div className="fixed inset-x-0 bottom-0 z-sticky lg:hidden">
        <div
          className="border-t"
          style={{
            background: 'var(--surface-card)',
            borderColor: 'var(--hairline)',
            boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.12)',
          }}
        >
          <div
            aria-hidden="true"
            className="h-1 origin-left"
            style={{ background: 'var(--grad-gold)', transform: `scaleX(${progress / 100})` }}
          />
          <div className="shell flex items-center gap-4 py-3">
            <div className="min-w-0">
              <p className="label-caps">
                {cart.length} {cart.length === 1 ? 'item' : 'items'}
              </p>
              <p
                className="price text-xl font-bold"
                style={{ color: 'var(--text-strong)' }}
              >
                {inr(total)}
              </p>
            </div>
            <Link to="/checkout" className="btn-primary btn-shine ml-auto shrink-0 px-5">
              Proceed to Checkout
              <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;
