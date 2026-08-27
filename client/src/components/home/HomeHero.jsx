import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  BadgeCheck,
  LayoutGrid,
  ShoppingCart,
  Sparkles,
  Star,
  Truck,
} from 'lucide-react';
import FireworksCanvas from '../ui/FireworksCanvas';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { revealVariants, staggerParent } from '../../lib/motion';
import { trustBadges } from './homeData';
import ProductShowcase from './ProductShowcase';

/* Deep maroon into warm ink. Deliberately dark in both themes — the hero is
   the one place the storefront commits to a night field. */
const HERO_FIELD =
  'linear-gradient(158deg, var(--maroon-900) 0%, var(--maroon-800) 33%, #2A1512 68%, #1A1714 100%)';

const HERO_GLOW =
  'radial-gradient(46% 42% at 82% 14%, rgba(210,166,79,0.26) 0%, transparent 100%),' +
  'radial-gradient(40% 40% at 8% 82%, rgba(195,58,20,0.28) 0%, transparent 100%),' +
  'radial-gradient(30% 30% at 50% 0%, rgba(247,174,44,0.16) 0%, transparent 100%)';

/* Background + readability scrim of a slide without a photo. Shared with the
   slides-loading shell so the hero composition (including its brightness)
   never changes when the first slide mounts. */
const SLIDE_FALLBACK_BG =
  'radial-gradient(70% 90% at 20% 10%, rgba(210,166,79,0.18), transparent 60%),' +
  'linear-gradient(158deg, var(--maroon-900) 0%, var(--maroon-800) 40%, #2A1512 75%, #1A1714 100%)';

const SLIDE_SCRIM =
  'linear-gradient(180deg, rgba(10,7,7,0.55) 0%, rgba(10,7,7,0.35) 45%, rgba(10,7,7,0.72) 100%)';

/* Existing hero meta copy, kept verbatim and moved out of floating overlays
   into one legible strip that cannot overflow a 320px screen. */
const heroMeta = [
  { text: 'Festival Sale Live', icon: BadgeCheck },
  { text: 'Same-Day Delivery', icon: Truck },
  { text: '4.8 Rated Store', icon: Star },
];

const SLIDE_DURATION_MS = 6000;

/* ------------------------------------------------------------------------
   Legacy single hero — rendered only while the admin has not configured
   any carousel slides. Slides are never hardcoded into the storefront.
   ------------------------------------------------------------------------ */

const LegacyHero = ({ heroSettings, allProducts, onBrowseCategories }) => {
  const reduced = useReducedMotion();
  const reveal = revealVariants(reduced, 18);

  return (
    <>
      <div className="pointer-events-none absolute inset-0" style={{ background: HERO_GLOW }} aria-hidden="true" />
      <FireworksCanvas className="ambient-only" opacity={0.5} />

      <div className="shell-wide relative flex min-h-[65vh] flex-col justify-center py-14 md:py-20 lg:py-24">
        {/* Mobile: text first, then product. Desktop: grid with text left, product right. */}
        <div className="flex flex-col items-center gap-12 lg:grid lg:grid-cols-12 lg:items-center lg:gap-12">
          {/* ---- Copy ---- */}
          <motion.div
            className="text-center lg:col-span-7 lg:text-left"
            initial="hidden"
            animate="visible"
            variants={staggerParent(reduced, 0.07)}
          >
            <motion.span
              variants={reveal}
              className="inline-flex min-h-[32px] items-center gap-2 rounded-[var(--r-pill)] px-4 py-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.2em]"
              style={{
                border: '1px solid rgba(210,166,79,0.42)',
                background: 'rgba(210,166,79,0.10)',
                color: 'var(--gold-400)',
              }}
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
              Premium Fireworks Store
            </motion.span>

            <motion.h1
              variants={reveal}
              className="hero-title mt-6 text-balance"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: heroSettings.mainHeadingSize || 'clamp(2.5rem, 5.2vw, 4rem)',
                color: 'var(--white-soft)',
              }}
            >
              {heroSettings.mainHeading || "Hyderabad's Premium Fireworks Store"}
            </motion.h1>

            <motion.div variants={reveal} className="mt-6">
              <hr className="rule-gold mx-auto w-40 lg:mx-0" style={{ opacity: 0.85 }} />
            </motion.div>

            <motion.p
              variants={reveal}
              className="mx-auto mt-6 max-w-xl text-pretty lg:mx-0"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: heroSettings.subHeadingSize || 'clamp(1.05rem, 1.8vw, 1.3rem)',
                lineHeight: 1.65,
                color: 'var(--text-on-dark)',
              }}
            >
              {heroSettings.subHeading ||
                'Celebrate every occasion with premium quality crackers, exciting festival offers, and safe doorstep delivery.'}
            </motion.p>

            <motion.div
              variants={reveal}
              className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center lg:justify-start"
            >
              <Link to="/products" className="btn-primary btn-shine px-7 py-3.5 text-sm">
                <ShoppingCart className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                {heroSettings.ctaText || 'Shop Crackers'}
              </Link>

              <a
                href="#wholesale"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--r-md)] border-[1.5px] border-[rgba(210,166,79,0.5)] bg-[rgba(237,231,223,0.06)] px-7 py-3.5 text-sm font-semibold text-accent-400 transition-[transform,color,border-color] duration-200 hover:-translate-y-0.5 hover:border-saffron-400 hover:text-saffron-400"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                Explore Wholesale
              </a>

              <button
                type="button"
                onClick={onBrowseCategories}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 px-3 text-sm font-semibold underline-offset-4 transition-colors duration-200 hover:underline"
                style={{ fontFamily: 'var(--font-body)', color: 'var(--text-on-dark)' }}
              >
                <LayoutGrid className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                Browse Categories
              </button>
            </motion.div>

            <motion.ul
              variants={reveal}
              className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 lg:justify-start"
            >
              {trustBadges.map((badge) => (
                <li key={badge.text} className="flex items-center gap-2">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-pill)]"
                    style={{ background: 'var(--grad-ember)', boxShadow: 'var(--shadow-ember)' }}
                  >
                    <badge.icon className="h-4 w-4" strokeWidth={2.3} style={{ color: '#FFFFFF' }} aria-hidden="true" />
                  </span>
                  <span
                    className="text-sm font-semibold"
                    style={{ fontFamily: 'var(--font-body)', color: 'var(--text-on-dark)' }}
                  >
                    {badge.text}
                  </span>
                </li>
              ))}
            </motion.ul>
          </motion.div>

          {/* ---- Animated product showcase ---- */}
          <motion.div
            className="lg:col-span-5"
            initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reduced ? 0.001 : 0.55, ease: [0.16, 1, 0.3, 1] }}
          >
            <ProductShowcase products={allProducts} />

            {/* Meta badges below product */}
            <ul className="mt-7 flex flex-wrap items-center justify-center gap-2">
              {heroMeta.map((meta) => (
                <li
                  key={meta.text}
                  className="inline-flex min-h-[32px] items-center gap-1.5 rounded-[var(--r-pill)] px-3 py-1.5"
                  style={{
                    border: '1px solid rgba(237,231,223,0.16)',
                    background: 'rgba(237,231,223,0.07)',
                  }}
                >
                  <meta.icon
                    className="h-3.5 w-3.5 shrink-0"
                    strokeWidth={2.3}
                    style={{ color: 'var(--gold-400)' }}
                    aria-hidden="true"
                  />
                  <span
                    className="text-[0.75rem] font-semibold"
                    style={{ fontFamily: 'var(--font-body)', color: 'var(--text-on-dark)' }}
                  >
                    {meta.text}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </>
  );
};

/* ------------------------------------------------------------------------
   Admin-driven banner carousel. Every slide comes from the heroSlides
   collection; nothing here is hardcoded.
   ------------------------------------------------------------------------ */

const SlideContent = ({ slide, heroSettings, onBrowseCategories }) => (
  <div className="shell-wide relative z-10 flex flex-col items-center justify-center py-14 md:py-20 lg:items-start lg:py-24 lg:text-left">
    <div className="flex w-full flex-col items-center gap-12 lg:grid lg:grid-cols-12 lg:items-center lg:gap-12">
      <div className="text-center lg:col-span-7 lg:text-left">
        <span
          className="inline-flex min-h-[32px] items-center gap-2 rounded-[var(--r-pill)] px-4 py-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.2em]"
          style={{
            border: '1px solid rgba(210,166,79,0.42)',
            background: 'rgba(210,166,79,0.10)',
            color: 'var(--gold-400)',
          }}
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
          {slide.eyebrow || 'Premium Fireworks Store'}
        </span>

        <h1
          className="hero-title mt-6 max-w-4xl text-balance"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: heroSettings.mainHeadingSize || 'clamp(2.5rem, 5.2vw, 4rem)',
            color: 'var(--white-soft)',
            textShadow: '0 6px 30px rgba(0,0,0,0.55)',
          }}
        >
          {slide.heading || heroSettings.mainHeading || "Hyderabad's Premium Fireworks Store"}
        </h1>

        <hr className="rule-gold mx-auto mt-6 w-40 lg:mx-0" style={{ opacity: 0.85 }} />

        <p
          className="mx-auto mt-6 max-w-2xl text-pretty lg:mx-0"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: heroSettings.subHeadingSize || 'clamp(1.05rem, 1.8vw, 1.3rem)',
            lineHeight: 1.65,
            color: 'var(--text-on-dark)',
            textShadow: '0 4px 18px rgba(0,0,0,0.6)',
          }}
        >
          {slide.subHeading || heroSettings.subHeading || ''}
        </p>

        <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start">
          <Link
            to={slide.ctaLink || '/products'}
            className="btn-primary btn-shine px-7 py-3.5 text-sm"
          >
            <ShoppingCart className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            {slide.ctaText || heroSettings.ctaText || 'Shop Crackers'}
          </Link>

          <button
            type="button"
            onClick={onBrowseCategories}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--r-md)] border-[1.5px] border-[rgba(210,166,79,0.5)] bg-[rgba(237,231,223,0.06)] px-7 py-3.5 text-sm font-semibold text-accent-400 transition-[transform,color,border-color] duration-200 hover:-translate-y-0.5 hover:border-saffron-400 hover:text-saffron-400"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            <LayoutGrid className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            Browse Categories
          </button>
        </div>
      </div>
    </div>
  </div>
);

const HomeHero = ({
  slides,
  heroSettings,
  bannerSettings,
  allProducts,
  onBrowseCategories,
}) => {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tabHidden, setTabHidden] = useState(
    () => typeof document !== 'undefined' && document.visibilityState === 'hidden'
  );

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisibilityChange = () => setTabHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const count = slides ? slides.length : 0;
  const slidesLoading = slides == null;
  const go = (next) => setIndex(((next % count) + count) % count);

  useEffect(() => {
    if (count <= 1 || paused || tabHidden || reduced) return undefined;
    const timer = setInterval(() => go(index + 1), SLIDE_DURATION_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, paused, tabHidden, reduced, index]);

  return (
    <section className="relative isolate overflow-hidden" style={{ background: HERO_FIELD }}>
      {slidesLoading ? (
        /* Slides are still loading (first visit without a cached copy). Render
           the exact carousel shell now — same wrapper, same backgrounds, same
           scrim — so the hero is a stable composition from the first frame and
           mounting the real slide later only fades its photo in. */
        <div className="relative min-h-[65vh] md:min-h-[70vh] lg:min-h-[75vh]">
          <div className="pointer-events-none absolute inset-0" style={{ background: HERO_GLOW }} aria-hidden="true" />
          <div className="absolute inset-0" style={{ background: SLIDE_FALLBACK_BG }} aria-hidden="true" />
          <div className="absolute inset-0" style={{ background: SLIDE_SCRIM }} aria-hidden="true" />
          <FireworksCanvas className="ambient-only" opacity={0.35} />
          <SlideContent
            slide={{}}
            heroSettings={heroSettings}
            onBrowseCategories={onBrowseCategories}
          />
        </div>
      ) : count === 0 ? (
        <LegacyHero
          heroSettings={heroSettings}
          allProducts={allProducts}
          onBrowseCategories={onBrowseCategories}
        />
      ) : (
        <div
          className="relative min-h-[65vh] md:min-h-[70vh] lg:min-h-[75vh]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="pointer-events-none absolute inset-0" style={{ background: HERO_GLOW }} aria-hidden="true" />
          <FireworksCanvas className="ambient-only" opacity={0.35} />

          {slides.map((slide, i) => {
            const active = i === index;
            return (
              <div
                key={slide.id}
                className={`absolute inset-0 transition-opacity duration-700 ${active ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
                aria-hidden={!active}
              >
                {slide.imageUrl ? (
                  <img
                    key={`${slide.id}-${active ? 'on' : 'off'}`}
                    src={slide.imageUrl}
                    alt={slide.heading || 'Crackers Hyderabad offer'}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    className={`h-full w-full object-cover ${active ? 'hero-zoom' : ''}`}
                  />
                ) : (
                  <div
                    className="h-full w-full"
                    style={{
                      background: SLIDE_FALLBACK_BG,
                    }}
                  />
                )}
                <div
                  className="absolute inset-0"
                  style={{ background: SLIDE_SCRIM }}
                  aria-hidden="true"
                />
                <SlideContent
                  slide={slide}
                  heroSettings={heroSettings}
                  onBrowseCategories={onBrowseCategories}
                />
              </div>
            );
          })}

          {/* Persistent product showcase — sits above all slides */}
          {allProducts && allProducts.length > 0 && (
            <div className="shell-wide pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center py-14 md:py-20 lg:items-start lg:py-24">
              <div className="flex w-full flex-col items-center gap-12 lg:grid lg:grid-cols-12 lg:items-center lg:gap-12">
                {/* Spacer for text column */}
                <div className="hidden lg:col-span-7 lg:block" />
                {/* Product showcase on right side (desktop only) */}
                <div className="pointer-events-auto hidden lg:col-span-5 lg:block">
                  <ProductShowcase products={allProducts} />
                </div>
              </div>
              {/* Product showcase below text on mobile */}
              <div className="pointer-events-auto mt-10 block lg:hidden">
                <ProductShowcase products={allProducts} />
              </div>
            </div>
          )}

          {/* Controls */}
          {count > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(index - 1)}
                aria-label="Previous banner"
                className="arrow-btn absolute left-4 top-1/2 z-20 hidden -translate-y-1/2 md:inline-flex"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => go(index + 1)}
                aria-label="Next banner"
                className="arrow-btn absolute right-4 top-1/2 z-20 hidden -translate-y-1/2 md:inline-flex"
              >
                <ChevronRight className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
              </button>

              <div
                className="absolute inset-x-0 bottom-6 z-20 flex items-center justify-center gap-2.5"
                role="tablist"
                aria-label="Banner navigation"
              >
                {slides.map((slide, i) => (
                  <button
                    key={slide.id}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    aria-label={`Go to banner ${i + 1}`}
                    onClick={() => go(i)}
                    className="h-2.5 rounded-[var(--r-pill)] transition-all duration-300"
                    style={{
                      width: i === index ? '2rem' : '0.625rem',
                      background: i === index ? 'var(--gold-400)' : 'rgba(237,231,223,0.32)',
                      boxShadow: i === index ? '0 0 12px rgba(210,166,79,0.7)' : 'none',
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- Banner 1 strip (admin controlled) ---- */}
      {bannerSettings.banner1Enabled && (
        <div
          className="relative"
          style={{ borderTop: '1px solid rgba(210,166,79,0.22)', background: 'rgba(26,23,20,0.42)' }}
        >
          <div className="shell-wide py-3.5 text-center">
            <p
              className="text-xs font-semibold sm:text-sm"
              style={{ fontFamily: 'var(--font-body)', color: 'var(--text-on-dark)' }}
            >
              {bannerSettings.banner1Text}
            </p>
          </div>
        </div>
      )}
    </section>
  );
};

export default HomeHero;