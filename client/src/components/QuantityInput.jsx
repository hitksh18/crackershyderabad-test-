import { useState, useEffect } from 'react';

/**
 * Numeric quantity field.
 *
 * Keeps a local draft while focused so a half-typed value never round-trips
 * into cart state, and snaps back to a valid quantity on blur.
 */
const QuantityInput = ({ value, onChange, className = '', style, ariaLabel = 'Quantity' }) => {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  const handleChange = (raw) => {
    setDraft(raw);
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 1) {
      onChange(num);
    }
  };

  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      aria-label={ariaLabel}
      value={focused ? draft : String(value)}
      onFocus={() => {
        setFocused(true);
        setDraft(String(value));
      }}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={() => {
        setFocused(false);
        const num = parseInt(draft, 10);
        if (isNaN(num) || num < 1) onChange(1);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className={`tabular appearance-none text-center [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${className}`}
      style={{ minHeight: 44, ...style }}
    />
  );
};

export default QuantityInput;
