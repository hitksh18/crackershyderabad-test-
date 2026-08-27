import { motion } from 'framer-motion';
import { Plus, Minus, Trash2 } from 'lucide-react';
import { DURATION, EASE_OUT_EXPO, EASE_IN_SOFT } from '../../lib/motion';

const rowVariants = (reduced) => ({
  hidden: { opacity: 0, y: reduced ? 0 : -8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: reduced ? 0.001 : DURATION.fast, ease: EASE_OUT_EXPO },
  },
  exit: {
    opacity: 0,
    x: reduced ? 0 : -24,
    transition: { duration: reduced ? 0.001 : DURATION.fast, ease: EASE_IN_SOFT },
  },
});

/**
 * One line of the current bill.
 *
 * The unit price uses the same offline fallback chain as the totals so the
 * row and the invoice can never disagree.
 */
const BillLineRow = ({ item, index, onStep, onSetQuantity, onRemove, reduced }) => {
  const unitPrice =
    item.offlineDiscountPrice ||
    item.offlineMRP ||
    item.offlinePrice ||
    item.onlinePrice ||
    0;

  return (
    <motion.div
      variants={rowVariants(reduced)}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex flex-col gap-3 rounded-[var(--r-md)] px-3 py-2.5 sm:flex-row sm:items-center"
      style={{ background: 'var(--surface-raised)', border: '1px solid var(--hairline)' }}
    >
      <span
        className="tabular hidden w-6 shrink-0 text-xs font-bold sm:block"
        style={{ color: 'var(--text-subtle)' }}
      >
        {index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
          <span className="tabular mr-1.5 sm:hidden" style={{ color: 'var(--text-subtle)' }}>
            {index + 1}.
          </span>
          {item.name}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-xs">
          <span className="tabular font-semibold" style={{ color: 'var(--text-body)' }}>
            ₹{unitPrice} each
          </span>
          {item.offlineDiscountPrice && (
            <span className="tabular line-through" style={{ color: 'var(--text-subtle)' }}>
              ₹{item.offlineMRP}
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 sm:flex-nowrap sm:justify-end">
        <div className="flex w-[8.5rem] shrink-0 items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => onStep(item.id, -1)}
            aria-label={`Decrease quantity of ${item.name}`}
            className="flex h-11 w-11 items-center justify-center rounded-[var(--r-sm)] border border-[color:var(--hairline)] bg-[color:var(--surface-card)] transition-colors hover:border-vermilion-400"
            style={{ color: 'var(--crimson-600)' }}
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>

          <label htmlFor={`qty-${item.id}`} className="sr-only">
            Quantity of {item.name}
          </label>
          <input
            id={`qty-${item.id}`}
            type="number"
            min="1"
            value={item.quantity}
            onChange={(e) => onSetQuantity(item.id, e.target.value)}
            className="tabular h-11 w-14 rounded-[var(--r-sm)] border border-[color:var(--hairline-strong)] bg-[color:var(--surface-card)] text-center text-sm font-bold text-[color:var(--text-strong)] focus:border-primary-500"
          />

          <button
            type="button"
            onClick={() => onStep(item.id, 1)}
            aria-label={`Increase quantity of ${item.name}`}
            className="flex h-11 w-11 items-center justify-center rounded-[var(--r-sm)] border border-[color:var(--hairline)] bg-[color:var(--surface-card)] transition-colors hover:border-leaf-500"
            style={{ color: 'var(--leaf-600)' }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p
          className="tabular w-24 shrink-0 text-right text-sm font-bold"
          style={{ color: 'var(--text-strong)' }}
        >
          ₹{(unitPrice * item.quantity).toFixed(2)}
        </p>

        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.name} from bill`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-sm)] transition-colors hover:bg-vermilion-50 dark:hover:bg-vermilion-900/20"
          style={{ color: 'var(--crimson-600)' }}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </motion.div>
  );
};

export default BillLineRow;
