import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { popoverVariants } from '../lib/motion';

const CartNotificationPill = () => {
  const { cartNotice } = useCart();
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!cartNotice) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(timer);
  }, [cartNotice]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center"
      style={{ top: 140 }}
      role="status"
      aria-live="polite"
    >
      <AnimatePresence mode="wait">
        {visible && cartNotice && (
          <motion.div
            key={cartNotice.id}
            variants={popoverVariants(reduced)}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="inline-flex w-fit max-w-full items-center gap-2 rounded-[var(--r-pill)] border py-1.5 pl-3 pr-4"
            style={{
              background: 'linear-gradient(120deg, #245F42 0%, #2C7A53 55%, #3E9A6B 100%)',
              borderColor: 'rgba(255, 253, 248, 0.3)',
              boxShadow: '0 8px 22px rgba(44, 122, 83, 0.34)',
            }}
          >
            <CheckCircle2
              className="h-4 w-4 shrink-0"
              strokeWidth={2.6}
              style={{ color: '#FFFFFF' }}
            />
            <span
              className="truncate text-sm font-semibold"
              style={{ color: '#FFFFFF', fontFamily: 'var(--font-body)' }}
            >
              {cartNotice.message}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CartNotificationPill;
