import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Skeleton } from '../ui/Skeleton';

/* The one place the storefront commits to a deep night field, in both themes. */
const HERO_FIELD =
  'linear-gradient(158deg, var(--maroon-900) 0%, var(--maroon-800) 33%, #2A1512 68%, #1A1714 100%)';

/* Used when an admin has not supplied an image for a banner/card. */
const FALLBACK_GRADIENT =
  'linear-gradient(158deg, var(--maroon-900) 0%, var(--maroon-800) 45%, #2A1512 75%, #1A1714 100%)';

const clampDuration = (sec) => Math.max(3, Math.min(12, Number(sec) || 5));

/* Fit mode: "cover" fills the box and may crop; "contain" shows the whole
   image with the field showing around it. Defaults to cover for banners.
   Preserves the admin's intended composition without stretching/pixelation. */
const fitFor = (entity, fallback) => (entity && entity.fit === 'contain' ? 'contain' : fallback);

/* Placeholder while an image resolves so the box holds its height. */
const BannerImage = ({ src, alt, fit, zoom }) => (
  <div className="absolute inset-0" style={{ background: FALLBACK_GRADIENT }}>
    {src && (
      <img
        src={src}
        alt={alt || ''}
        loading="eager"
        className={
          zoom
            ? `hero-zoom absolute inset-0 h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`
            : `absolute inset-0 h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`
        }
      />
    )}
  </div>
);

/* Large auto-playing left banner — image only, no overlay text. */
const HeroCarousel = ({ banners, durationSec }) => {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = banners.length;
  const durationMs = clampDuration(durationSec) * 1000;
  const go = (next) => setIndex(((next % count) + count) % count);

  useEffect(() => {
    if (count <= 1 || paused || reduced) return undefined;
    const timer = setInterval(() => go(index + 1), durationMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, paused, reduced, index, durationMs]);

  const banner = banners[index];

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-md)' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={banner.id}
          initial={{ opacity: 0, x: reduced ? 0 : 26 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: reduced ? 0 : -26 }}
          transition={{ duration: reduced ? 0.001 : 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0"
        >
          <BannerImage src={banner.imageDesktop} alt={banner.alt || ''} fit={fitFor(banner, 'cover')} zoom={!reduced} />
        </motion.div>
      </AnimatePresence>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous banner"
            className="arrow-btn absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 md:inline-flex"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next banner"
            className="arrow-btn absolute right-3 top-1/2 z-20 hidden -translate-y-1/2 md:inline-flex"
          >
            <ChevronRight className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </button>

          <div
            className="absolute bottom-4 right-5 z-20 flex items-center gap-1.5"
            role="tablist"
            aria-label="Banner navigation"
          >
            {banners.map((b, i) => {
              const active = i === index;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={`Go to banner ${i + 1}`}
                  onClick={() => go(i)}
                  className="relative h-1.5 overflow-hidden rounded-[var(--r-pill)] transition-[width] duration-300"
                  style={{
                    width: active ? '2rem' : '0.5rem',
                    background: 'rgba(237,231,223,0.4)',
                  }}
                >
                  {active && !reduced && (
                    <span
                      className="hero-progress-fill absolute inset-y-0 left-0"
                      style={{
                        background: 'var(--gold-400)',
                        boxShadow: '0 0 10px rgba(210,166,79,0.7)',
                        animationDuration: `${durationMs}ms`,
                        animationPlayState: paused ? 'paused' : 'running',
                      }}
                    />
                  )}
                  {active && reduced && (
                    <span
                      className="absolute inset-y-0 left-0 w-full"
                      style={{ background: 'var(--gold-400)' }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

/* One small promotional card (right slot). Static image, whole card links.
   Subtle zoom on hover — no text, no overlay animation. */
const PromoCard = ({ card }) => (
  <Link
    to={card.ctaLink || '/products'}
    aria-label={card.alt || 'Promotional banner'}
    className="group relative block h-full min-h-0 overflow-hidden"
    style={{ borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-md)' }}
  >
    <div
      className="absolute inset-0 transition-transform duration-700 ease-out-expo group-hover:scale-[1.06]"
      style={{ background: FALLBACK_GRADIENT }}
    >
      {(card.imageDesktop || card.image) && (
        <img
          src={card.imageDesktop || card.image}
          alt={card.alt || ''}
          loading="lazy"
          className={`h-full w-full ${fitFor(card, 'cover') === 'contain' ? 'object-contain' : 'object-cover'}`}
        />
      )}
    </div>
  </Link>
);

/* Mobile banner slide — image only. */
const MobileSlide = ({ banner }) => (
  <div className="relative h-full w-full" style={{ overflow: 'hidden', borderRadius: 'var(--r-xl)' }}>
    <BannerImage
      src={banner.imageMobile || banner.imageDesktop}
      alt={banner.alt || ''}
      fit={fitFor(banner, 'cover')}
      zoom={false}
    />
  </div>
);

/* Mobile promo card — image only. */
const MobileCard = ({ card }) => (
  <Link
    to={card.ctaLink || '/products'}
    aria-label={card.alt || 'Promotional banner'}
    className="relative block h-full w-full overflow-hidden"
    style={{ borderRadius: 'var(--r-xl)' }}
  >
    <div className="absolute inset-0" style={{ background: FALLBACK_GRADIENT }}>
      {(card.imageMobile || card.imageDesktop || card.image) && (
        <img
          src={card.imageMobile || card.imageDesktop || card.image}
          alt={card.alt || ''}
          loading="lazy"
          className={`h-full w-full ${fitFor(card, 'cover') === 'contain' ? 'object-contain' : 'object-cover'}`}
        />
      )}
    </div>
  </Link>
);

/* Mobile: swipeable single-column — main banner(s) first, then promo cards.
   Every slide is 16:9 so mobile proportions match the uploaded artwork. */
const MobileHeroSwipe = ({ banners, cards, durationSec }) => {
  const reduced = useReducedMotion();
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);
  const lastInteraction = useRef(0);
  const durationMs = clampDuration(durationSec) * 1000;
  const items = [
    ...banners.map((b) => ({ kind: 'banner', banner: b })),
    ...cards.map((c) => ({ kind: 'card', card: c })),
  ];

  const goTo = (i) => {
    const track = trackRef.current;
    if (!track) return;
    setIndex(i);
    track.scrollTo({ left: i * track.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
  };

  useEffect(() => {
    const track = trackRef.current;
    if (track) track.scrollLeft = 0;
  }, []);

  useEffect(() => {
    const bannerCount = banners.length;
    if (bannerCount <= 1 || reduced) return undefined;
    const timer = setInterval(() => {
      if (Date.now() - lastInteraction.current < 6000) return;
      goTo(index + 1);
    }, durationMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banners.length, index, durationMs, reduced]);

  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const i = Math.round(track.scrollLeft / track.clientWidth);
    if (i !== index && i >= 0 && i < items.length) setIndex(i);
  };

  return (
    <div className="relative">
      <div
        ref={trackRef}
        onScroll={onScroll}
        onTouchStart={() => { lastInteraction.current = Date.now(); }}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        role="region"
        aria-label="Promotional carousel"
      >
        {items.map((item, i) => (
          <div
            key={`${item.kind}-${item.banner?.id || item.card?.id || i}`}
            className="aspect-video w-full shrink-0 snap-start"
          >
            {item.kind === 'banner' ? (
              <MobileSlide banner={item.banner} />
            ) : (
              <MobileCard card={item.card} />
            )}
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <div
          className="mt-3 flex items-center justify-center gap-1.5"
          role="tablist"
          aria-label="Promotional carousel navigation"
        >
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => goTo(i)}
              className="h-1.5 rounded-[var(--r-pill)] transition-all duration-300"
              style={{
                width: i === index ? '1.5rem' : '0.5rem',
                background: i === index ? 'var(--gold-400)' : 'rgba(237,231,223,0.32)',
                boxShadow: i === index ? '0 0 10px rgba(210,166,79,0.6)' : 'none',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const HeroShellSkeleton = () => (
  <>
    <div className="md:hidden">
      <Skeleton className="aspect-video w-full" rounded="var(--r-xl)" />
    </div>
    <div className="hidden md:grid md:grid-cols-[2fr_1fr] md:gap-3 lg:gap-4">
      <Skeleton className="aspect-video w-full" rounded="var(--r-xl)" />
      <div className="grid grid-rows-2 md:gap-3 lg:gap-4">
        <Skeleton className="h-full min-h-0 w-full" rounded="var(--r-xl)" />
        <Skeleton className="h-full min-h-0 w-full" rounded="var(--r-xl)" />
      </div>
    </div>
  </>
);

/**
 * Storefront hero — full-bleed and 16:9: one large auto-rotating banner
 * (~2/3, aspect-video) plus two promotional image slots (~1/3) stretching to
 * the same row height. On mobile it becomes a swipeable single-column strip
 * of 16:9 slides (main banner → promo 1 → promo 2). The banners are
 * image-only creatives — no overlay text, no product scrolling.
 * Driven entirely by the shared homepage config (heroBanners + promoCards +
 * carouselDurationSec); falls back to demo content so the hero never disappears.
 *
 * `mode` is 'auto' on the storefront (both branches, CSS picks). The homepage
 * canvas passes 'desktop' or 'mobile' to force one branch in its previews.
 */
const StorefrontHero = ({ banners, cards, durationSec, loading, mode = 'auto' }) => {
  const activeBanners = (banners || []).filter((b) => b.enabled !== false);
  const activeCards = (cards || []).filter((c) => c.enabled !== false).slice(0, 2);
  const showMobile = mode !== 'desktop';
  const showDesktop = mode !== 'mobile';

  if (loading) {
    return (
      <section className="relative isolate overflow-hidden" style={{ background: HERO_FIELD }}>
        <div className="relative mx-auto w-full max-w-[2000px] px-3 pt-3 md:px-5 md:pt-4 pb-3 md:pb-4">
          <HeroShellSkeleton />
        </div>
      </section>
    );
  }

  return (
    <section className="relative isolate overflow-hidden" style={{ background: HERO_FIELD }}>
      <div className="relative mx-auto w-full max-w-[2000px] px-3 pt-3 pb-3 md:px-5 md:pt-4 md:pb-4">
        {/* Mobile/tablet portrait: swipeable single column — banner then promo
            cards, each a 16:9 slide that fills the available width. */}
        {showMobile && (
          <div className={showDesktop ? 'md:hidden' : ''}>
            <MobileHeroSwipe banners={activeBanners} cards={activeCards} durationSec={durationSec} />
          </div>
        )}

        {/* Desktop: full-width asymmetric hero. The main carousel is a 16:9
            frame (~2/3) and the two promo slots stack beside it (~1/3),
            stretching to the same row height so edges align. */}
        {showDesktop && (
          <div className={showMobile
            ? 'hidden gap-3 md:grid md:grid-cols-[2fr_1fr] md:items-stretch md:gap-3 lg:gap-4 xl:gap-5'
            : 'grid gap-3 grid-cols-[2fr_1fr] items-stretch lg:gap-4 xl:gap-5'}
          >
          <div className="aspect-video min-h-0 w-full">
            <HeroCarousel banners={activeBanners} durationSec={durationSec} />
          </div>
          <div className="grid min-h-0 grid-rows-2 md:gap-3 lg:gap-4 xl:gap-5">
            {activeCards.length > 0 &&
              activeCards.map((card) => (
                <div key={card.id} className="h-full min-h-0">
                  <PromoCard card={card} />
                </div>
              ))}
            {activeCards.length === 0 &&
              [0, 1].map((i) => (
                <div
                  key={i}
                  className="relative h-full min-h-0"
                  style={{ borderRadius: 'var(--r-xl)', background: FALLBACK_GRADIENT }}
                />
              ))}
          </div>
          </div>
          )}
        </div>
    </section>
  );
};

export default StorefrontHero;
