import { Check } from 'lucide-react';

/**
 * Presentational checkout progress rail: Details -> Delivery -> Review.
 *
 * Purely derived from what the form already contains — it holds no state and
 * drives nothing. Colour is never the only signal: completed steps carry a
 * check mark, the active step carries `aria-current` and visible-text state.
 */
const STEPS = [
  { id: 'details', label: 'Details' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'review', label: 'Review' },
];

const CheckoutSteps = ({ activeIndex = 0, completedCount = 0, className = '' }) => (
  <ol className={`flex w-full items-center gap-2 sm:gap-3 ${className}`} aria-label="Checkout progress">
    {STEPS.map((step, index) => {
      // Done and active are mutually exclusive: the step you are standing on
      // reads as current even when the form behind it is already complete.
      const isActive = index === activeIndex;
      const isDone = index < completedCount && !isActive;

      const dotStyle = isDone
        ? { background: 'var(--grad-gold)', color: 'var(--maroon-900)', borderColor: 'transparent' }
        : isActive
          ? { background: 'var(--grad-ember)', color: '#FFFFFF', borderColor: 'transparent' }
          : { background: 'var(--surface-sunken)', color: 'var(--text-subtle)', borderColor: 'var(--hairline-strong)' };

      return (
        <li key={step.id} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none sm:gap-3">
          <span
            className="flex min-w-0 items-center gap-2"
            aria-current={isActive ? 'step' : undefined}
          >
            <span
              aria-hidden="true"
              className="tabular inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold"
              style={dotStyle}
            >
              {isDone ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
            </span>
            <span
              className="truncate text-[0.7rem] font-bold uppercase tracking-[0.14em]"
              style={{ color: isActive || isDone ? 'var(--text-strong)' : 'var(--text-subtle)' }}
            >
              {step.label}
            </span>
            <span className="sr-only">
              {isDone ? 'completed' : isActive ? 'current step' : 'not started'}
            </span>
          </span>

          {index < STEPS.length - 1 && (
            <span
              aria-hidden="true"
              className="h-px min-w-[0.75rem] flex-1"
              style={{ background: isDone ? 'var(--gold-400)' : 'var(--hairline-strong)' }}
            />
          )}
        </li>
      );
    })}
  </ol>
);

export default CheckoutSteps;
