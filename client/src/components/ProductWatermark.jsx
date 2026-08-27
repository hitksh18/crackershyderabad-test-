/**
 * Ownership mark stamped on product imagery.
 *
 * Purely decorative: aria-hidden, never interactive, and it must never
 * intercept a click meant for the image link underneath.
 */

const ProductWatermark = ({ className = '' }) => {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute bottom-2 right-2 z-raised flex select-none items-center gap-1 rounded-[var(--r-pill)] border px-1.5 py-0.5 ${className}`}
      style={{
        background: 'rgba(26, 23, 20, 0.44)',
        borderColor: 'rgba(210, 166, 79, 0.42)',
        WebkitBackdropFilter: 'blur(2px)',
        backdropFilter: 'blur(2px)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <svg viewBox="0 0 12 12" className="h-2 w-2 shrink-0" fill="none">
        <path
          d="M6 0.5 L7.1 4.9 L11.5 6 L7.1 7.1 L6 11.5 L4.9 7.1 L0.5 6 L4.9 4.9 Z"
          fill="var(--gold-400)"
        />
      </svg>
      <span
        className="whitespace-nowrap text-[9px] font-bold tracking-[0.07em]"
        style={{ color: 'rgba(255, 253, 248, 0.92)' }}
      >
        Crackers Hyderabad
      </span>
    </div>
  );
};

export default ProductWatermark;
