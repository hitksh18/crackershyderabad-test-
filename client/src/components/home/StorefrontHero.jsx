import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { MapPin, ShoppingBag, Gift, BadgeCheck, Truck, ShieldCheck, Headphones } from 'lucide-react';
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
/*  Cinematic Hero — fixed-height campaign frame, text left with negative  */
/*  space, right open for the night-skyline photography. Trust assurances  */
/*  live in the slim strip below, not in the hero. Carousel is crossfade   */
/*  only, no zoom.                                                         */
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
        className="cinematic-hero relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#1a0f0e 0%,#2a1512 100%)' }}
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
      {/* ---------------- Cinematic atmosphere — restrained, directional ---------------- */}
      {/* Base: deep charcoal / near-black. Left holds the copy; right recedes so
          the night-skyline photography stays the focal point. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: '#0B0908' }}
      />
      {/* ---------------- Background image — crossfade only, NO zoom ---------------- */}
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={active.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.001 : 0.9, ease: [0.4, 0, 0.2, 1] }}
          className="absolute inset-0"
        >
          {bgSrc && (
            <img
              src={bgSrc}
              alt={active.alt || ''}
              loading="eager"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: isMobile ? 'center 62%' : 'center 38%' }}
              draggable={false}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Legibility gradient — left holds copy, dissolves by ~two-thirds so the
          right-side skyline and fireworks breathe */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, rgba(8,5,4,0.94) 0%, rgba(10,7,6,0.84) 26%, rgba(10,7,6,0.48) 46%, rgba(10,7,6,0.14) 62%, transparent 78%),' +
            'linear-gradient(180deg, rgba(5,3,3,0.38) 0%, transparent 30%, transparent 60%, rgba(5,3,3,0.58) 100%)',
        }}
      />
      {/* Warm amber city glow — low right, barely-there horizon light */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          right: '-8%',
          bottom: '-22%',
          width: '62%',
          height: '68%',
          background: 'radial-gradient(closest-side, rgba(247,174,44,0.08), transparent 72%)',
        }}
      />
      {/* Vignette — gentle edge falloff for a campaign-frame feel */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(120% 100% at 50% 42%, transparent 58%, rgba(0,0,0,0.36) 100%)' }}
      />
      {/* Film grain — subtle, static, matches the site's paper-grain language */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")",
        }}
      />
      {/* Top blend into navbar — softens the hard edge */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-12"
        style={{ background: 'linear-gradient(180deg, rgba(7,5,5,0.5) 0%, transparent 100%)' }}
      />

      {/* ---------------- Content shell — text left with negative space, right open for the skyline ---------------- */}
      <div className="relative z-10 mx-auto flex h-full min-h-[inherit] w-full max-w-[1400px] flex-col justify-center px-5 py-14 sm:px-8 md:grid md:grid-cols-[minmax(0,46%)_1fr] md:items-center md:gap-8 md:px-10 lg:grid-cols-[minmax(0,43%)_1fr] lg:px-12 xl:px-14">
        <div className="min-w-0 max-w-[560px]">
          {/* Eyebrow */}
          <motion.div
            key={`eyebrow-${active.id}`}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mb-5 flex items-center gap-3"
          >
            <span aria-hidden="true" className="h-px w-10 shrink-0" style={{ background: '#B28C46', opacity: 0.8 }} />
            <span
              className="text-[11px] font-semibold tracking-[0.24em]"
              style={{ color: '#C9A961', fontFamily: 'var(--font-body)' }}
            >
              PREMIUM FIREWORKS STORE
            </span>
          </motion.div>

          {/* Headline — editorial serif, two lines */}
          <motion.div
            key={`heading-${active.id}`}
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1
              aria-label="Crackers Hyderabad"
              className="m-0 font-bold"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(2.9rem, 4.6vw, 4.4rem)',
                letterSpacing: '-0.02em',
                lineHeight: 1.02,
              }}
            >
              <span className="block" style={{ color: '#F8F2E7', fontWeight: 500 }}>
                Crackers
              </span>
              <span
                className="block"
                style={{
                  background: 'linear-gradient(180deg, #D9BE82 0%, #C2A059 55%, #A8823F 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                  fontWeight: 700,
                  paddingBottom: '0.08em',
                }}
              >
                Hyderabad
              </span>
            </h1>
          </motion.div>

          {/* Supporting line */}
          <motion.p
            key={`sub-${active.id}`}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 text-sm leading-relaxed sm:text-[15px]"
            style={{ color: 'rgba(248,242,231,0.72)', fontFamily: 'var(--font-body)', fontWeight: 400, letterSpacing: '0.02em' }}
          >
            Premium Crackers&nbsp;&nbsp;|&nbsp;&nbsp;Best Prices&nbsp;&nbsp;|&nbsp;&nbsp;Safe &amp; Trusted
          </motion.p>

          {/* CTAs */}
          <motion.div
            key={`cta-${active.id}`}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Link
              to={shopHref}
              className="inline-flex h-12 items-center gap-2.5 rounded-lg px-7 text-[13px] font-bold tracking-[0.12em] transition-all"
              style={{
                background: 'linear-gradient(180deg, #DDBB72 0%, #BE9550 100%)',
                color: '#241A0C',
                border: '1px solid rgba(255,255,255,0.16)',
                boxShadow: '0 8px 26px rgba(190,149,80,0.28)',
                fontFamily: 'var(--font-body)',
              }}
            >
              <ShoppingBag className="h-[15px] w-[15px]" strokeWidth={2.1} aria-hidden="true" />
              <span>SHOP NOW</span>
            </Link>

            <Link
              to={exploreHref}
              className="inline-flex h-12 items-center gap-2.5 rounded-lg px-7 text-[13px] font-bold tracking-[0.12em] transition-colors"
              style={{
                background: 'rgba(12,8,7,0.5)',
                color: '#D9BE82',
                border: '1px solid rgba(178,140,70,0.45)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                fontFamily: 'var(--font-body)',
              }}
            >
              <Gift className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden="true" />
              <span>EXPLORE OFFERS</span>
            </Link>
          </motion.div>

          {/* Location line */}
          <motion.div
            key={`loc-${active.id}`}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.34 }}
            className="mt-9 flex items-center gap-2"
            aria-hidden="true"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: '#B28C46' }} strokeWidth={2} />
            <span className="text-[11px] font-semibold tracking-[0.2em]" style={{ color: 'rgba(248,242,231,0.5)', fontFamily: 'var(--font-body)' }}>
              HYDERABAD&nbsp;&nbsp;·&nbsp;&nbsp;A CITY THAT CELEBRATES
            </span>
          </motion.div>
        </div>

        {/* Right column — intentionally open: the night-skyline photography is the focal point */}
        <div aria-hidden="true" className="hidden min-h-[1px] md:block" />
      </div>

      {/* ---------------- Minimal position dots — one quiet control ---------------- */}
      {count > 1 && (
        <div
          className="absolute bottom-6 left-5 z-20 flex items-center gap-2 sm:left-8 md:left-10 lg:left-12 xl:left-14"
          role="tablist"
          aria-label="Hero slides"
        >
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
                width: i === index ? 26 : 6,
                background: i === index ? '#C9A961' : 'rgba(248,242,231,0.28)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const HERO_TRUST_ITEMS = [
  { icon: BadgeCheck, title: '100% Genuine', sub: 'Products' },
  { icon: Truck, title: 'Free Shipping', sub: 'Above ₹2,500' },
  { icon: ShieldCheck, title: 'Safe & Secure', sub: 'Payments' },
  { icon: Headphones, title: 'Dedicated', sub: 'Support' },
];

/* Slim trust strip directly beneath the hero — quiet text row with hairline
   dividers, no cards or boxes. Carries the four assurances that used to sit
   inside the hero. */
const HeroTrustStrip = () => (
  <div
    className="relative"
    style={{ background: '#0B0908', borderTop: '1px solid rgba(178,140,70,0.22)' }}
  >
    <div className="mx-auto grid max-w-[1400px] grid-cols-2 px-5 sm:px-8 md:grid-cols-4 md:px-10 lg:px-12 xl:px-14">
      {HERO_TRUST_ITEMS.map((item, i) => {
        const Icon = item.icon;
        return (
          <div
            key={item.title}
            className={`flex items-center gap-2.5 py-4 md:justify-center md:py-5 ${
              i > 0 ? 'md:border-l md:border-[rgba(178,140,70,0.16)]' : ''
            } ${i % 2 === 1 ? 'justify-end md:justify-center' : ''}`}
          >
            <Icon className="h-[15px] w-[15px] shrink-0" style={{ color: '#B28C46' }} strokeWidth={1.9} aria-hidden="true" />
            <span className="leading-tight">
              <span className="block text-xs font-semibold tracking-wide" style={{ color: '#F8F2E7', fontFamily: 'var(--font-body)' }}>
                {item.title}
              </span>
              <span className="block text-[11px]" style={{ color: 'rgba(248,242,231,0.52)', fontFamily: 'var(--font-body)' }}>
                {item.sub}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  </div>
);

const HeroShellSkeleton = () => (
  <div
    className="cinematic-hero relative w-full overflow-hidden"
    style={{ background: '#0B0908' }}
  >
    <div className="mx-auto flex h-full max-w-[1400px] flex-col justify-center gap-4 px-6 py-8 sm:px-8">
      <Skeleton className="h-3 w-36" rounded="999px" />
      <Skeleton className="h-14 w-72" rounded="8px" />
      <Skeleton className="h-4 w-80" rounded="8px" />
      <div className="mt-2 flex gap-3">
        <Skeleton className="h-12 w-36" rounded="8px" />
        <Skeleton className="h-12 w-44" rounded="8px" />
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
      <section className="hero-stage relative isolate overflow-hidden" style={{ background: HERO_SHELL_BG }}>
        <HeroShellSkeleton />
      </section>
    );
  }

  // Empty state — no banners: show skeleton-like fallback but no crash
  if (activeBanners.length === 0) {
    return (
      <section className="hero-stage relative isolate overflow-hidden" style={{ background: HERO_SHELL_BG }}>
        <HeroShellSkeleton />
      </section>
    );
  }

  return (
    <section className="hero-stage relative isolate w-full max-w-full overflow-hidden" style={{ background: HERO_SHELL_BG, maxWidth: '100%', overflow: 'clip' }}>
      {/* Top soft blend — navbar dark surface flows into hero artwork */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8" style={{ background: 'linear-gradient(180deg, rgba(7,5,5,0.45) 0%, transparent 100%)' }} />
      {/* Hero is visually part of navbar — no hard gap, no bright separator */}
      <div className={mode === 'auto' ? 'relative w-full max-w-full' : 'relative mx-auto w-full max-w-[420px]'}>
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
      {/* Slim trust strip — the four hero assurances live here now, not in the hero */}
      <HeroTrustStrip />
    </section>
  );
};

export default StorefrontHero;
