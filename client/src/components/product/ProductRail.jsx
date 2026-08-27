import { useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ProductCard from '../ProductCard';

const RESUME_DELAY = 4000;
const SPEED = 25;

/**
 * Horizontal product rail with smooth continuous auto-scroll and arrow controls.
 *
 * Used on the product detail page for "Related Products" and "Recently Viewed".
 * Products are rendered twice for seamless looping. Auto-scroll pauses during
 * user interaction and resumes after inactivity.
 */
const ProductRail = ({ headingId, eyebrow, title, items, reduced }) => {
  const railRef = useRef(null);
  const rafRef = useRef(null);
  const pausedRef = useRef(false);
  const resumeTimerRef = useRef(null);
  const lastTimeRef = useRef(null);

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

  useEffect(() => {
    const el = railRef.current;
    if (!el || reduced || !items || items.length < 2) return;

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
  }, [items, reduced]);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;

    el.addEventListener('pointerdown', pause);
    el.addEventListener('pointerup', scheduleResume);
    el.addEventListener('pointercancel', scheduleResume);
    el.addEventListener('mouseenter', pause);
    el.addEventListener('mouseleave', scheduleResume);

    return () => {
      el.removeEventListener('pointerdown', pause);
      el.removeEventListener('pointerup', scheduleResume);
      el.removeEventListener('pointercancel', scheduleResume);
      el.removeEventListener('mouseenter', pause);
      el.removeEventListener('mouseleave', scheduleResume);
    };
  }, [pause, scheduleResume]);

  useEffect(() => () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
  }, []);

  const scrollRail = (dir) => {
    const el = railRef.current;
    if (!el) return;
    pause();
    el.scrollBy({ left: dir * 320, behavior: reduced ? 'auto' : 'smooth' });
    scheduleResume();
  };

  const loopItems = items && items.length > 0 ? [...items, ...items] : [];

  return (
    <section aria-labelledby={headingId} className="mt-14">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <span className="section-eyebrow">{eyebrow}</span>
          <h2 id={headingId} className="section-title mt-2">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => scrollRail(-1)}
            aria-label={`Scroll ${title} left`}
            className="arrow-btn"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => scrollRail(1)}
            aria-label={`Scroll ${title} right`}
            className="arrow-btn"
          >
            <ChevronRight className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div ref={railRef} className="rail">
        {loopItems.map((item, index) => (
          <div key={`${item.id}-${index >= items.length ? 'dup' : 'orig'}`} className="w-[72%] sm:w-[300px] md:w-[320px]">
            <ProductCard product={item} />
          </div>
        ))}
      </div>
    </section>
  );
};

export default ProductRail;
