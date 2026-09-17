import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, MapPin, ShoppingBag, Gift, Gem, Truck, ShieldCheck, Headset } from 'lucide-react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Skeleton } from '../ui/Skeleton';

/* Navbar is dark glass on homepage; hero must feel like its continuation — not a card on a light page */
const HERO_SHELL_BG = '#070505';

const clampDuration = (sec) => Math.max(3, Math.min(12, Number(sec) || 5));

/* ------------------------------------------------------------------ */
/*  Helper — trusting permanent KVM URLs from Canvas. Never invent URLs. */
/* ------------------------------------------------------------------ */
const imageFor = (banner, isMobile) => {
  if (!banner) return null;
  if (isMobile) return banner.imageMobile || banner.imageDesktop || banner.image || null;
  return banner.imageDesktop || banner.image || banner.imageMobile || null;
};

/* ================================================================== */
/*  Cinematic Hero — ONE immersive banner, left-aligned premium copy.   */
/*  No right-side promo column. Carousel is crossfade only, no zoom.   */
/* ================================================================== */

const CinematicHero = ({ banners, durationSec }) => {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = banners.length;
  const durationMs = clampDuration(durationSec) * 1000;
  const go = (next) => setIndex(((next % count) + count) % count);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const onChange = (e) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (count <= 1 || paused || reduced) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), durationMs);
    return () => clearInterval(timer);
  }, [count, paused, reduced, durationMs]);

  if (count === 0) {
    return (
      <div
        className="relative overflow-hidden"
        style={{ borderRadius: '22px', background: 'linear-gradient(135deg,#1a0f0e 0%,#2a1512 100%)', minHeight: 520 }}
      />
    );
  }

  const active = banners[index];
  const bgSrc = imageFor(active, isMobile);
  const shopHref = active?.ctaLink || '/products';
  // Explore Offers — use secondary link if provided, otherwise browse offers
  const exploreHref = active?.ctaSecondaryLink || '/products?category=Gift Boxes';

  return (
    <div
      className="cinematic-hero group relative isolate w-full max-w-full overflow-hidden"
      style={{
        // Immersive — subtle radius, blends into page, no hard card boundary
        background: '#0c0a09',
        width: '100%',
        maxWidth: '100%',
        overflow: 'clip',
        // Hero owns the initial viewport: viewport - header stack (navbar + announcement)
        // Uses modern viewport units so mobile browser chrome is handled (dvh/svh)
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* ---------------- Background image — crossfade only, NO zoom ---------------- */}
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={active.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.001 : 0.65, ease: [0.4, 0, 0.2, 1] }}
          className="absolute inset-0"
        >
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#1a0f0e 0%,#0c0a09 100%)' }} />
          {bgSrc && (
            <img
              src={bgSrc}
              alt={active.alt || ''}
              loading="eager"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: 'center 35%' }}
              draggable={false}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ---------------- Cinematic overlays — directional left→right, NOT full dark ---------------- */}
      {/* Localized left-side gradient for readable copy — right stays vibrant */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            // Left 0–45% darker, center moderate, right transparent for fireworks
            'linear-gradient(90deg, rgba(10,6,5,0.88) 0%, rgba(14,8,7,0.78) 30%, rgba(14,8,7,0.42) 52%, rgba(14,8,7,0.12) 72%, transparent 88%),' +
            'linear-gradient(180deg, rgba(6,4,4,0.20) 0%, transparent 38%, transparent 74%, rgba(6,4,4,0.28) 100%)',
        }}
      />
      {/* Top blend into navbar — almost invisible, softens hard edge */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[64px]"
        style={{ background: 'linear-gradient(180deg, rgba(7,5,5,0.55) 0%, transparent 100%)', opacity: 0.9 }}
      />
      {/* Bottom blend into next section — uses page background, not another dark bar */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[84px]"
        style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(6,4,4,0.32) 42%, rgba(253,249,240,0.0) 100%)', opacity: 1 }}
      />
      {/* Very faint gold haze — centred, barely visible, not clutter */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          left: '46%',
          top: '42%',
          width: 360,
          height: 360,
          transform: 'translate(-50%,-50%)',
          background: 'radial-gradient(closest-side, rgba(210,166,79,0.05), transparent 70%)',
          opacity: 1,
        }}
      />

      {/* ---------------- Main content — 40–45% on desktop, full on mobile ---------------- */}
      <div className="relative z-10 flex h-full min-h-[inherit] w-full max-w-[92%] flex-col justify-center px-5 py-8 sm:max-w-[52%] sm:px-8 md:max-w-[46%] md:px-10 lg:max-w-[44%] lg:px-12 xl:max-w-[42%] xl:px-14">
        {/* Eyebrow */}
        <motion.div
          key={`eyebrow-${active.id}`}
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="mb-3 flex items-center gap-3"
        >
          <span aria-hidden="true" className="h-px w-9 shrink-0" style={{ background: 'linear-gradient(90deg, #D2A64F, rgba(210,166,79,0.15))' }} />
          <span
            className="text-[11px] font-bold tracking-[0.18em]"
            style={{ color: '#D2A64F', fontFamily: 'var(--font-body)' }}
          >
            PREMIUM FIREWORKS STORE
          </span>
        </motion.div>

        {/* Heading — Crackers Hyderabad */}
        <motion.div
          key={`heading-${active.id}`}
          initial={reduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1
            className="font-bold leading-[0.95] tracking-tight"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(2.4rem, 5vw, 4.35rem)',
              letterSpacing: '-0.03em',
              lineHeight: 0.95,
            }}
          >
            <span className="block" style={{ color: '#FFF8EC', fontWeight: 400, letterSpacing: '-0.02em' }}>
              Crackers
            </span>
            <span
              className="block"
              style={{
                background: 'linear-gradient(180deg, #E2C177 8%, #D2A64F 42%, #9E7029 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                fontWeight: 700,
                paddingBottom: '0.06em',
              }}
            >
              Hyderabad
            </span>
          </h1>
        </motion.div>

        {/* Subtitle */}
        <motion.p
          key={`sub-${active.id}`}
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-3 max-w-[36ch] text-sm leading-relaxed sm:text-[15px]"
          style={{ color: 'rgba(255,248,236,0.78)', fontFamily: 'var(--font-body)', fontWeight: 400, letterSpacing: '0.01em' }}
        >
          Premium Crackers | Best Prices | Safe &amp; Trusted
        </motion.p>

        {/* CTAs */}
        <motion.div
          key={`cta-${active.id}`}
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.26, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 flex flex-wrap items-center gap-3"
        >
          <Link
            to={shopHref}
            className="inline-flex h-11 items-center gap-2 rounded-xl px-6 text-sm font-bold transition-all"
            style={{
              background: 'linear-gradient(180deg, #E8C86A 0%, #D2A64F 100%)',
              color: '#2A1D0F',
              border: '1px solid rgba(255,255,255,0.22)',
              boxShadow: '0 6px 22px rgba(210,166,79,0.32), 0 1px 0 rgba(255,255,255,0.4) inset',
              letterSpacing: '0.01em',
            }}
          >
            <ShoppingBag className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            <span>Shop Now</span>
            <ChevronRight className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          </Link>

          <Link
            to={exploreHref}
            className="inline-flex h-11 items-center gap-2 rounded-xl px-6 text-sm font-bold transition-colors"
            style={{
              background: 'rgba(18,11,10,0.55)',
              color: '#E2C177',
              border: '1px solid rgba(210,166,79,0.55)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.28)',
            }}
          >
            <Gift className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            <span>Explore Offers</span>
            <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          </Link>
        </motion.div>

        {/* Trust row — compact, gold line icons */}
        <motion.div
          key={`trust-${active.id}`}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.34 }}
          className="mt-8 grid max-w-[560px] grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:gap-6 lg:gap-7"
        >
          {[
            { icon: Gem, title: '100% Genuine', sub: 'Products' },
            { icon: Truck, title: 'Free Shipping', sub: 'Above ₹2,500' },
            { icon: ShieldCheck, title: 'Safe & Secure', sub: 'Payments' },
            { icon: Headset, title: 'Dedicated', sub: 'Support' },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="flex items-center gap-2.5">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: 'rgba(210,166,79,0.09)',
                    border: '1px solid rgba(210,166,79,0.18)',
                  }}
                >
                  <Icon className="h-[15px] w-[15px]" style={{ color: '#D2A64F' }} strokeWidth={1.9} aria-hidden="true" />
                </span>
                <span className="leading-tight">
                  <span className="block text-xs font-semibold tracking-wide" style={{ color: '#FFF8EC', fontFamily: 'var(--font-body)' }}>
                    {f.title}
                  </span>
                  <span className="block text-[11px] font-medium" style={{ color: 'rgba(255,248,236,0.58)' }}>
                    {f.sub}
                  </span>
                </span>
              </div>
            );
          })}
        </motion.div>
      </div>

      {/* ---------------- Pagination — minimal elegant ---------------- */}
      {count > 1 && (
        <div className="absolute bottom-5 left-5 z-20 hidden items-center gap-3 sm:left-8 md:left-10 lg:left-12 xl:left-14 sm:flex">
          {banners.map((b, i) => {
            const activeIdx = i === index;
            return (
              <button
                key={b.id}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                aria-current={activeIdx}
                onClick={() => go(i)}
                className="group flex items-center gap-2"
              >
                <span
                  className="text-[11px] font-bold tabular-nums transition-colors"
                  style={{ color: activeIdx ? '#E2C177' : 'rgba(255,248,236,0.38)', letterSpacing: '0.04em' }}
                >
                  0{i + 1}
                </span>
                <span
                  className="h-px w-10 transition-all"
                  style={{
                    background: activeIdx ? 'linear-gradient(90deg,#D2A64F,#E2C177)' : 'rgba(255,248,236,0.22)',
                    width: activeIdx ? 44 : 32,
                    opacity: activeIdx ? 1 : 0.9,
                    boxShadow: activeIdx ? '0 0 8px rgba(210,166,79,0.45)' : 'none',
                    height: activeIdx ? 2 : 1,
                  }}
                />
              </button>
            );
          })}
        </div>
      )}
      {/* Mobile dots */}
      {count > 1 && (
        <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 sm:hidden" role="tablist" aria-label="Hero navigation">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => go(i)}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === index ? 22 : 7,
                background: i === index ? '#D2A64F' : 'rgba(255,248,236,0.32)',
                boxShadow: i === index ? '0 0 8px rgba(210,166,79,0.6)' : 'none',
              }}
            />
          ))}
        </div>
      )}

      {/* ---------------- Prev / Next — small circular, dark translucent, gold border ---------------- */}
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous banner"
            className="absolute left-3 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full transition-all sm:left-4 md:flex"
            style={{
              background: 'rgba(13,8,7,0.62)',
              border: '1px solid rgba(210,166,79,0.45)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: '#FFF8EC',
              boxShadow: '0 2px 14px rgba(0,0,0,0.42)',
            }}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next banner"
            className="absolute right-3 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full transition-all sm:right-4 md:flex"
            style={{
              background: 'rgba(13,8,7,0.62)',
              border: '1px solid rgba(210,166,79,0.45)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: '#FFF8EC',
              boxShadow: '0 2px 14px rgba(0,0,0,0.42)',
            }}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          </button>
        </>
      )}

      {/* ---------------- Hyderabad branding — subtle, bottom-right ---------------- */}
      <div
        className="pointer-events-none absolute bottom-5 right-5 z-20 hidden items-center gap-2 sm:right-8 md:right-10 lg:right-12 sm:flex"
        aria-hidden="true"
      >
        <MapPin className="h-3.5 w-3.5" style={{ color: '#D2A64F' }} strokeWidth={2} />
        <span className="flex flex-col items-start gap-0 text-right">
          <span className="text-[11px] font-bold tracking-[0.16em]" style={{ color: '#E2C177' }}>
            HYDERABAD
          </span>
          <span className="text-[9px] font-semibold tracking-[0.14em]" style={{ color: 'rgba(255,248,236,0.42)' }}>
            A CITY THAT CELEBRATES
          </span>
        </span>
      </div>
    </div>
  );
};

const HeroShellSkeleton = () => (
  <div
    className="cinematic-hero relative w-full overflow-hidden"
    style={{
      background: 'linear-gradient(135deg,#1a0f0e 0%,#0c0a09 100%)',
    }}
  >
    <div className="absolute inset-0 flex flex-col justify-center gap-4 px-6 py-8 sm:px-8">
      <Skeleton className="h-3 w-32" rounded="999px" />
      <Skeleton className="h-10 w-64" rounded="8px" />
      <Skeleton className="h-4 w-72" rounded="8px" />
      <div className="mt-2 flex gap-3">
        <Skeleton className="h-10 w-28" rounded="12px" />
        <Skeleton className="h-10 w-36" rounded="12px" />
      </div>
    </div>
  </div>
);

/**
 * Storefront hero — ONE immersive cinematic banner.
 * The old split layout (left large + right 2 promo cards) is removed.
 * Accepts the same props (banners, cards, durationSec, loading, mode) so
 * Canvas/Home.jsx require no changes. `cards` is accepted but not rendered.
 */
const StorefrontHero = ({ banners, cards, durationSec, loading, mode = 'auto' }) => {
  const activeBanners = (banners || []).filter((b) => b.enabled !== false);
  void cards; // accepted for API compat, old split-layout cards not rendered

  if (import.meta.env.DEV) {
    console.log(
      `[HERO] new cinematic: banners=${activeBanners.length} (cards hidden)`,
      activeBanners.map((c) => ({ id: c.id, image: c.imageDesktop || c.image }))
    );
  }

  const showMobile = mode !== 'desktop';
  const showDesktop = mode !== 'mobile';

  if (loading) {
    return (
      <section className="relative isolate overflow-hidden" style={{ background: HERO_SHELL_BG }}>
        <div className="relative mx-auto w-full max-w-[2000px] px-3 md:px-5">
          <HeroShellSkeleton />
        </div>
      </section>
    );
  }

  // Empty state — no banners: show skeleton-like fallback but no crash
  if (activeBanners.length === 0) {
    return (
      <section className="relative isolate overflow-hidden" style={{ background: HERO_SHELL_BG }}>
        <div className="relative mx-auto w-full max-w-[2000px] px-3 md:px-5">
          <HeroShellSkeleton />
        </div>
      </section>
    );
  }

  return (
    <section className="relative isolate overflow-hidden w-full max-w-full" style={{ background: HERO_SHELL_BG, maxWidth: '100%', overflow: 'clip' }}>
      {/* Top soft blend — navbar dark surface flows into hero artwork */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-8" style={{ background: 'linear-gradient(180deg, rgba(7,5,5,0.45) 0%, transparent 100%)' }} />
      {/* Hero is visually part of navbar — no hard gap, no bright separator */}
      <div className="relative mx-auto w-full max-w-[2000px] px-3 md:px-5" style={{ maxWidth: 'min(100%, 2000px)' }}>
        {/* Both desktop and mobile now use the same cinematic hero — responsive via CSS.
            The mode prop (from Canvas preview) still works: if mode is desktop/mobile
            we force that rendering, otherwise auto renders the responsive hero. */}
        {showMobile && showDesktop ? (
          <CinematicHero banners={activeBanners} durationSec={durationSec} />
        ) : showMobile ? (
          // Canvas mobile preview — render a constrained version
          <div className="mx-auto max-w-[420px]">
            <CinematicHero banners={activeBanners} durationSec={durationSec} />
          </div>
        ) : (
          <CinematicHero banners={activeBanners} durationSec={durationSec} />
        )}
      </div>
      {/* Bottom subtle dark dissolve — no bright white/gold glow, barely noticeable */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-10" style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(7,5,5,0.38) 55%, rgba(7,5,5,0.68) 100%)', opacity: 0.85 }} />
    </section>
  );
};

export default StorefrontHero;
