import { useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import ProductCard from '../ProductCard';
import SectionHeading from '../ui/SectionHeading';
import { ProductCardSkeleton } from '../ui/Skeleton';
import useDragScroll from '../../hooks/useDragScroll';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Full-width product carousel with smooth continuous auto-scroll.
 *
 * The rail renders products twice (original + duplicate) inside a native
 * overflow-x:auto container. A requestAnimationFrame loop incrementally
 * moves scrollLeft. When the scroll reaches the midpoint (start of the
 * duplicate set), it silently resets to 0 — the visual content is identical
 * so the reset is invisible.
 *
 * Auto-scroll pauses on hover, touch, drag, and arrow interaction.
 * Resumes after 4 seconds of inactivity.
 */
const RESUME_DELAY = 4000;
const SPEED = 30; // pixels per second

const HomeProductRail = ({
  eyebrow,
  title,
  subtitle,
  products,
  loading,
  showAllLink,
  railLabel,
}) => {
  const railRef = useRef(null);
  const rafRef = useRef(null);
  const pausedRef = useRef(false);
  const resumeTimerRef = useRef(null);
  const lastTimeRef = useRef(null);
  const reduced = useReducedMotion();

  useDragScroll(railRef);

  const pause = useCallback(() => {
    pausedRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
  }, []);

  const scheduleResume = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      pausedRef.current = false;
      lastTimeRef.current = null;
    }, RESUME_DELAY);
  }, []);

  const handlePointerDown = useCallback(() => {
    pause();
  }, [pause]);

  const handlePointerUp = useCallback(() => {
    scheduleResume();
  }, [scheduleResume]);

  useEffect(() => {
    const el = railRef.current;
    if (!el || reduced || !products || products.length < 2) return;

    const animate = (time) => {
      if (pausedRef.current) {
        lastTimeRef.current = null;
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      if (lastTimeRef.current === null) {
        lastTimeRef.current = time;
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      const delta = time - lastTimeRef.current;
      lastTimeRef.current = time;

      el.scrollLeft += SPEED * (delta / 1000);

      const half = el.scrollWidth / 2;
      if (el.scrollLeft >= half) {
        el.scrollLeft -= half;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [products, reduced]);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;

    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointerup', handlePointerUp);
    el.addEventListener('pointercancel', handlePointerUp);
    el.addEventListener('mouseenter', pause);
    el.addEventListener('mouseleave', scheduleResume);

    return () => {
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('pointerup', handlePointerUp);
      el.removeEventListener('pointercancel', handlePointerUp);
      el.removeEventListener('mouseenter', pause);
      el.removeEventListener('mouseleave', scheduleResume);
    };
  }, [handlePointerDown, handlePointerUp, pause, scheduleResume]);

  useEffect(() => () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
  }, []);

  const scrollRail = (dir) => {
    const el = railRef.current;
    if (!el) return;
    pause();
    // Move by exactly one card (card width + the gap between cards) so the
    // arrow buttons step cleanly between complete cards instead of relying
    // on the browser's native page scroll.
    let step = el.clientWidth * 0.75;
    const firstCard = el.querySelector('.rail-card');
    if (firstCard) {
      const gap = parseFloat(getComputedStyle(el).columnGap) || 16;
      step = firstCard.offsetWidth + gap;
    }
    el.scrollBy({ left: dir * step, behavior: reduced ? 'auto' : 'smooth' });
    scheduleResume();
  };

  const loopProducts = products && products.length > 0
    ? [...products, ...products]
    : [];

  return (
    <>
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        align="left"
        action={
          <div className="hidden items-center gap-2 sm:flex">
            <button
              type="button"
              onClick={() => scrollRail(-1)}
              aria-label={`Scroll ${railLabel} left`}
              className="arrow-btn"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => scrollRail(1)}
              aria-label={`Scroll ${railLabel} right`}
              className="arrow-btn"
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>
        }
      />

      <div
        ref={railRef}
        role="region"
        aria-label={railLabel}
        className="rail"
      >
        {loading ? (
          <>
            <span className="sr-only">Loading {railLabel}</span>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rail-card">
                <ProductCardSkeleton compact />
              </div>
            ))}
          </>
        ) : (
          loopProducts.map((product, index) => (
            <div key={`${product.id}-${index >= products.length ? 'dup' : 'orig'}`} className="rail-card">
              <ProductCard compact product={product} />
            </div>
          ))
        )}
      </div>

      {showAllLink && (
        <div className="mt-6 text-center">
          <Link to={showAllLink} className="btn-primary inline-flex px-8 py-3 text-sm">
            View All Products
            <ArrowRight className="h-4 w-4" strokeWidth={2.3} aria-hidden="true" />
          </Link>
        </div>
      )}
    </>
  );
};

export default HomeProductRail;
