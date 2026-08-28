import { Minus, Plus, ShoppingCart } from 'lucide-react';
import ImagePlaceholder from '../ImagePlaceholder';
import QuantityInput from '../QuantityInput';
import { inr } from '../../lib/currency';

/**
 * Docked add-to-cart bar for the product detail page.
 *
 * Visibility is driven by the caller; the slide itself is the `.sticky-cart-bar`
 * transform transition in index.css, which reduced motion already neutralises.
 *
 * While hidden the bar is still painted (so the slide can animate) but is taken
 * out of the tab order and the accessibility tree — otherwise keyboard users
 * would land on controls parked off-screen.
 */
const StickyCartBar = ({
  product,
  displayPrice,
  outOfStock,
  quantity,
  setQuantity,
  onAddToCart,
  visible,
}) => (
  <div
    className={`sticky-cart-bar ${visible ? 'visible' : ''}`}
    inert={!visible}
    aria-hidden={!visible || undefined}
  >
    <div className="shell pb-4">
      <div
        className="sticky-cart-bar is-glass flex items-center gap-3 px-4 py-3"
        style={{ borderRadius: 'var(--r-lg)' }}
      >
        {product.imageURL ? (
          <img
            src={product.imageURL}
            alt=""
            draggable={false}
            className="h-12 w-12 shrink-0 rounded-[var(--r-md)] object-contain p-1"
            style={{ background: 'var(--surface-sunken)' }}
          />
        ) : (
          <div
            className="h-12 w-12 shrink-0 rounded-[var(--r-md)] p-1"
            style={{ background: 'var(--surface-sunken)' }}
          >
            <ImagePlaceholder compact />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p
            className="product-name truncate text-sm font-bold"
            style={{ color: 'var(--text-strong)' }}
          >
            {product.name}
          </p>
          <p className="price text-sm font-bold" style={{ color: 'var(--ember-600)' }}>
            {inr(displayPrice)}
          </p>
        </div>

        <div
          className="hidden items-center gap-1 p-1 sm:flex"
          style={{
            background: 'var(--surface-sunken)',
            border: '1px solid var(--hairline-strong)',
            borderRadius: 'var(--r-md)',
          }}
        >
          <button
            type="button"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            aria-label="Decrease quantity"
            className="flex h-11 w-11 items-center justify-center rounded-[var(--r-sm)]"
            style={{ color: 'var(--ember-600)' }}
          >
            <Minus className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          </button>
          <QuantityInput
            value={quantity}
            onChange={setQuantity}
            ariaLabel="Quantity"
            className="tabular h-11 w-14 text-center text-base font-bold focus:outline-none"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--ember-600)',
              background: 'var(--surface-card)',
              border: '1px solid var(--hairline-strong)',
              borderRadius: 'var(--r-sm)',
            }}
          />
          <button
            type="button"
            onClick={() => setQuantity(quantity + 1)}
            aria-label="Increase quantity"
            className="flex h-11 w-11 items-center justify-center rounded-[var(--r-sm)]"
            style={{ color: 'var(--ember-600)' }}
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={onAddToCart}
          disabled={outOfStock}
          className="btn-primary shrink-0 px-4 text-sm"
        >
          <ShoppingCart className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          {outOfStock ? 'Out of Stock' : 'Add to Cart'}
        </button>
      </div>
    </div>
  </div>
);

export default StickyCartBar;
