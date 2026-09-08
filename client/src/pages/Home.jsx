import { useEffect, useRef, useState } from 'react';
import { Fragment } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';

import Footer from '../components/Footer';
import ScrollReveal from '../components/ui/ScrollReveal';
import { Skeleton } from '../components/ui/Skeleton';

import StorefrontHero from '../components/home/StorefrontHero';
import CategoryShowcase from '../components/home/CategoryShowcase';
import DealsSection from '../components/home/DealsSection';
import FeaturedSection from '../components/home/FeaturedSection';
import HomeProductRail from '../components/home/HomeProductRail';
import WholesaleSection from '../components/home/WholesaleSection';
import PromoSection from '../components/home/PromoSection';
import SecondaryBannerGrid from '../components/home/SecondaryBannerGrid';
import ProductBannerGrid from '../components/home/ProductBannerGrid';
import TrustSection from '../components/home/TrustSection';
import NewsletterBlock from '../components/home/NewsletterBlock';
import TrackOrderBlock from '../components/home/TrackOrderBlock';
import { categoryDefs } from '../components/home/homeData';

import { useHomepageSettings } from '../hooks/useHomepageSettings';
import { readHomepageConfig, DEFAULT_HERO_BANNERS, DEFAULT_PROMO_CARDS } from '../lib/homepage';
import { readBuilderConfig } from '../lib/homepageBuilder';
import { readSiteSettings, firstAnnouncementText } from '../lib/siteSettings';
import { resolveTrustCards } from '../lib/trustIcons';
import Seo from '../components/Seo';
import toast from '../utils/toast';

const DEFAULT_CONTENT = {
  categories: { eyebrow: 'Explore', title: 'Shop by Categories', subtitle: 'Handpicked ranges for every celebration' },
  deals: { eyebrow: 'Festive Offers', title: 'Festive Deals', subtitle: 'Limited-time offers for every celebration' },
  featured: { eyebrow: 'Handpicked', title: 'Featured Products', subtitle: 'Our best-selling fireworks handpicked for you' },
  bestSellers: { eyebrow: 'Top Rated', title: 'Best Sellers', subtitle: 'The most-loved picks from real orders' },
  trust: { eyebrow: 'Why Us', title: 'Why Choose Crackers Hyderabad', subtitle: 'The city’s most trusted fireworks destination' },
};

const DEFAULT_STRIP = {
  banner1Text: 'Your trusted online fireworks store in Hyderabad — from premium gift boxes to everyday sparklers',
  banner1Enabled: true,
};

const Home = () => {
  const navigate = useNavigate();
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [promotionalBanners, setPromotionalBanners] = useState([]);
  const [trackOrderId, setTrackOrderId] = useState('');
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const { settings: homepageSettings, loading: settingsLoading } = useHomepageSettings();
  const categoriesRef = useRef(null);

  const [homepageConfig, setHomepageConfig] = useState(null);
  const [builderConfig, setBuilderConfig] = useState(null);
  const [siteSettings, setSiteSettings] = useState(null);
  const [strip, setStrip] = useState(DEFAULT_STRIP);
  const [festiveDeals, setFestiveDeals] = useState([]);
  const [categoryShowcaseConfig, setCategoryShowcaseConfig] = useState(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [productsSnap, promoSnap, dealsSnap, catSnap, builder, site, homepage, stripSnap] = await Promise.all([
          getDocs(collection(db, 'products')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'promotionalBanners')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'festiveDeals')).catch(() => ({ docs: [] })),
          (async () => {
            try {
              const { getDoc, doc } = await import('firebase/firestore');
              const cfg = await getDoc(doc(db, 'settings', 'categoryShowcase'));
              return cfg.exists() ? cfg.data() : null;
            } catch { return null; }
          })(),
          readBuilderConfig().catch(() => null),
          readSiteSettings().catch(() => null),
          readHomepageConfig().catch(() => null),
          (async () => {
            try {
              const { getDoc, doc } = await import('firebase/firestore');
              const d = await getDoc(doc(db, 'bannerSettings', 'main'));
              return d.exists() ? d.data() : null;
            } catch { return null; }
          })(),
        ]);
        setAllProducts(productsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setPromotionalBanners(promoSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.enabled !== false).sort((a, b) => (b.order || 0) - (a.order || 0)));
        setFestiveDeals(dealsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.enabled !== false).sort((a, b) => (a.order || 0) - (b.order || 0)));
        if (catSnap) setCategoryShowcaseConfig(catSnap);
        if (builder) setBuilderConfig(builder);
        if (site) setSiteSettings(site);
        if (homepage) {
          setHomepageConfig(homepage);
          /* Trace the storefront read side: what the Hero will render. */
          if (import.meta.env.DEV) {
            console.log('[home] homepageConfig loaded:', {
              bannerCount: (homepage.heroBanners || []).length,
              banners: (homepage.heroBanners || []).map((b, i) => ({
                pos: i + 1,
                id: b.id,
                enabled: b.enabled !== false,
                image: b.imageDesktop || b.image || null,
              })),
            });
          }
        }
        if (stripSnap) setStrip(prev => ({ ...prev, ...stripSnap }));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const byAdminOrder = (a, b) =>
    (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) ||
    (b.salesCount || 0) - (a.salesCount || 0) ||
    (a.name || '').localeCompare(b.name || '');

  const featuredProducts = allProducts
    .filter(p => p.isFeatured)
    .concat(allProducts.filter(p => !p.isFeatured).sort(byAdminOrder));

  const bestSellers = [...allProducts]
    .sort(
      (a, b) =>
        (b.salesCount || 0) - (a.salesCount || 0) ||
        (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) ||
        (a.name || '').localeCompare(b.name || '')
    );

  /* Canvas-editable copy. Every field falls back to the long-standing
     hardcoded editorial, so a homepage saved before the canvas still
     renders exactly as before. maxItems 0/undefined means "show all". */
  const sectionText = homepageConfig?.sectionText || {};
  const maxOrAll = (arr, n) => (n && n > 0 ? arr.slice(0, n) : arr);
  const homepageContent = {
    categories: { ...DEFAULT_CONTENT.categories, ...(sectionText.categories || {}) },
    deals: { ...DEFAULT_CONTENT.deals, ...(sectionText.deals || {}) },
    featured: { ...DEFAULT_CONTENT.featured, ...(sectionText.featured || {}) },
    bestSellers: { ...DEFAULT_CONTENT.bestSellers, ...(sectionText.bestSellers || {}) },
    trust: { ...DEFAULT_CONTENT.trust, ...(sectionText.trust || {}) },
  };
  const newsletterCopy = sectionText.newsletter || undefined;
  const wholesaleCopy = sectionText.wholesale || undefined;
  const resolvedTrust = resolveTrustCards(homepageConfig?.trustCards);
  const trustCards = resolvedTrust ? resolvedTrust.filter(c => c.enabled !== false) : undefined;
  const featuredShown = maxOrAll(featuredProducts, sectionText.featured?.maxItems ?? 12);
  const bestShown = maxOrAll(bestSellers, sectionText.bestSellers?.maxItems ?? 10);
  const dealsShown = maxOrAll(festiveDeals, sectionText.deals?.maxItems);
  const announcementLine = firstAnnouncementText(siteSettings?.announcementBar, strip.banner1Text);

  const countInCategory = (matchNames) => {
    return allProducts.filter(p => {
      if (Array.isArray(p.categories)) {
        return p.categories.some(cat => matchNames.some(m => m.toLowerCase() === String(cat).toLowerCase()));
      }
      return matchNames.some(m => m.toLowerCase() === String(p.category || '').toLowerCase());
    }).length;
  };

  const visibleCategories = (() => {
    const cfg = categoryShowcaseConfig || {};
    const hidden = new Set(cfg.hidden || []);
    let list = categoryDefs.filter(cat => !hidden.has(cat.slug));
    if (Array.isArray(cfg.order) && cfg.order.length > 0) {
      const rank = new Map(cfg.order.map((slug, i) => [slug, i]));
      list = [...list].sort((a, b) => (rank.get(a.slug) ?? 999) - (rank.get(b.slug) ?? 999));
    }
    return list;
  })();

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (!newsletterEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newsletterEmail.trim())) {
      toast.error('Please enter a valid email address');
      return;
    }
    setNewsletterEmail('');
    toast.success('Subscribed! You will get all festival offers first.');
  };

  const handleTrackOrder = (e) => {
    e.preventDefault();
    if (trackOrderId.trim()) {
      navigate('/track-order', { state: { code: trackOrderId.trim() } });
    }
  };

  const hero = homepageConfig ? (
    <StorefrontHero
      banners={(homepageConfig.heroBanners || []).length > 0 ? homepageConfig.heroBanners : DEFAULT_HERO_BANNERS}
      cards={(homepageConfig.promoCards || []).length > 0 ? homepageConfig.promoCards : DEFAULT_PROMO_CARDS}
      durationSec={homepageConfig.carouselDurationSec}
      loading={false}
    />
  ) : (
    <StorefrontHero banners={[]} cards={[]} durationSec={5} loading />
  );

  // Builder-driven section order with fallback
  const sections = (builderConfig?.sections || []).filter(s => s.enabled !== false).sort((a,b) => (a.order??999)-(b.order??999));
  const hasBuilder = sections.length > 0;

  const renderSection = (section) => {
    switch (section.type) {
      case 'hero':
        return <Fragment key={section.id}>{hero}</Fragment>;
      case 'promoCards':
        return null; // hero already includes promoCards
      case 'announcement':
        return siteSettings?.announcementBar?.enabled ? (
          <div key={section.id} className="relative" style={{ borderTop: '1px solid rgba(210,166,79,0.22)', background: 'rgba(26,23,20,0.42)' }}>
            <div className="shell-wide py-3.5 text-center">
              <p className="text-xs font-semibold sm:text-sm" style={{ fontFamily: 'var(--font-body)', color: 'var(--text-on-dark)' }}>
                {announcementLine}
              </p>
            </div>
          </div>
        ) : null;
      case 'stableMessage':
        return siteSettings?.stableMessage?.enabled ? (
          <div key={section.id} className="relative" style={{ borderTop: '1px solid rgba(210,166,79,0.22)', background: 'rgba(26,23,20,0.42)' }}>
            <div className="shell-wide py-3.5 text-center">
              <p className="text-xs font-semibold sm:text-sm" style={{ fontFamily: 'var(--font-body)', color: 'var(--text-on-dark)' }}>
                {siteSettings.stableMessage.text}
              </p>
            </div>
          </div>
        ) : strip.banner1Enabled ? (
          <div key={section.id} className="relative" style={{ borderTop: '1px solid rgba(210,166,79,0.22)', background: 'rgba(26,23,20,0.42)' }}>
            <div className="shell-wide py-3.5 text-center">
              <p className="text-xs font-semibold sm:text-sm" style={{ fontFamily: 'var(--font-body)', color: 'var(--text-on-dark)' }}>
                {strip.banner1Text}
              </p>
            </div>
          </div>
        ) : null;
      case 'categories':
        return <CategoryShowcase key={section.id} sectionRef={categoriesRef} countInCategory={countInCategory} categories={visibleCategories} heading={homepageContent.categories} />;
      case 'featured':
        return <FeaturedSection key={section.id} products={featuredShown} heading={homepageContent.featured} loading={loading} />;
      case 'bestSellers':
        return (
          <section key={section.id} className="section-pad" style={{ background: 'var(--surface-page)' }}>
            <div className="shell-wide">
              <HomeProductRail eyebrow={homepageContent.bestSellers.eyebrow} title={homepageContent.bestSellers.title} subtitle={homepageContent.bestSellers.subtitle} products={bestShown} loading={loading} railLabel="best sellers" />
            </div>
          </section>
        );
      case 'promoBanners':
        return <PromoSection key={section.id} promotionalBanners={promotionalBanners} />;
      case 'secondaryBanners':
        return <SecondaryBannerGrid key={section.id} banners={homepageConfig?.secondaryBanners || []} />;
      case 'productBanners':
        return <ProductBannerGrid key={section.id} banners={homepageConfig?.productBanners || []} />;
      case 'festiveDeals':
        return dealsShown.length > 0 ? <DealsSection key={section.id} deals={dealsShown} heading={homepageContent.deals} /> : null;
      case 'bannerImage':
        return settingsLoading ? (
          <section key={section.id} className="section-pad-sm" style={{ background: 'var(--surface-card)' }}>
            <div className="shell-wide" role="status" aria-live="polite" aria-busy="true">
              <span className="sr-only">Loading homepage banner</span>
              <Skeleton className="h-56 w-full sm:h-72" rounded="var(--r-xl)" />
            </div>
          </section>
        ) : homepageSettings?.bannerImageUrl ? (
          <section key={section.id} className="section-pad-sm" style={{ background: 'var(--surface-card)' }}>
            <div className="shell-wide">
              <ScrollReveal distance={20} className="overflow-hidden" style={{ borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-lg)' }}>
                <img src={homepageSettings.bannerImageUrl} alt={homepageSettings.bannerImageAlt || 'Crackers Hyderabad Banner'} loading="lazy" className="max-h-[400px] w-full object-cover sm:max-h-[500px]" />
              </ScrollReveal>
            </div>
          </section>
        ) : null;
      case 'trust':
        return <TrustSection key={section.id} heading={homepageContent.trust} cards={trustCards} />;
      case 'newsletter':
        return (
          <section key={section.id} className="section-pad" style={{ background: 'var(--surface-sunken)' }}>
            <div className="shell-wide">
              <div className="grid gap-6 lg:grid-cols-[48fr_52fr] lg:gap-6">
                <NewsletterBlock email={newsletterEmail} onEmailChange={(e) => setNewsletterEmail(e.target.value)} onSubmit={handleSubscribe} copy={newsletterCopy} />
                <TrackOrderBlock orderId={trackOrderId} onOrderIdChange={(e) => setTrackOrderId(e.target.value)} onSubmit={handleTrackOrder} />
              </div>
            </div>
          </section>
        );
      case 'wholesale':
        return <WholesaleSection key={section.id} copy={wholesaleCopy} />;
      case 'banner': {
        // Generic banner section
        const cfg = section.config || {};
        if (!cfg.banners || cfg.banners.length === 0) return null;
        return (
          <section key={section.id} className="section-pad-sm" style={{ background: 'var(--surface-card)' }}>
            <div className="shell-wide">
              <div className="grid gap-4">
                {cfg.banners.filter(b => b.enabled !== false).map(b => (
                  <a key={b.id} href={b.ctaLink || '/products'} className="overflow-hidden rounded-2xl" style={{ border: '1px solid var(--hairline)' }}>
                    <img src={b.imageDesktop || b.image} alt={b.alt || ''} className="w-full object-cover" style={{ maxHeight: '400px' }} />
                  </a>
                ))}
              </div>
            </div>
          </section>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen">
      <Seo title="Crackers Hyderabad — Premium Fireworks & Wholesale Crackers" description="Premium fireworks and wholesale crackers in Hyderabad. Gift boxes, sparklers, rockets, flower pots and festival collections at wholesale pricing, with order tracking and doorstep delivery." canonical="/" />

      {hasBuilder ? (
        sections.map(renderSection)
      ) : (
        <>
          {hero}
          {strip.banner1Enabled && (
            <div className="relative" style={{ borderTop: '1px solid rgba(210,166,79,0.22)', background: 'rgba(26,23,20,0.42)' }}>
              <div className="shell-wide py-3.5 text-center">
                <p className="text-xs font-semibold sm:text-sm" style={{ fontFamily: 'var(--font-body)', color: 'var(--text-on-dark)' }}>
                  {strip.banner1Text}
                </p>
              </div>
            </div>
          )}
          <CategoryShowcase sectionRef={categoriesRef} countInCategory={countInCategory} categories={visibleCategories} heading={homepageContent.categories} />
          <FeaturedSection products={featuredShown} heading={homepageContent.featured} loading={loading} />
          <section className="section-pad" style={{ background: 'var(--surface-page)' }}>
            <div className="shell-wide">
              <HomeProductRail eyebrow={homepageContent.bestSellers.eyebrow} title={homepageContent.bestSellers.title} subtitle={homepageContent.bestSellers.subtitle} products={bestShown} loading={loading} railLabel="best sellers" />
            </div>
          </section>
          <PromoSection promotionalBanners={promotionalBanners} />
          <SecondaryBannerGrid banners={homepageConfig?.secondaryBanners || []} />
          <ProductBannerGrid banners={homepageConfig?.productBanners || []} />
          {dealsShown.length > 0 && <DealsSection deals={dealsShown} heading={homepageContent.deals} />}
          {settingsLoading ? (
            <section className="section-pad-sm" style={{ background: 'var(--surface-card)' }}>
              <div className="shell-wide" role="status" aria-live="polite" aria-busy="true">
                <span className="sr-only">Loading homepage banner</span>
                <Skeleton className="h-56 w-full sm:h-72" rounded="var(--r-xl)" />
              </div>
            </section>
          ) : homepageSettings.bannerImageUrl ? (
            <section className="section-pad-sm" style={{ background: 'var(--surface-card)' }}>
              <div className="shell-wide">
                <ScrollReveal distance={20} className="overflow-hidden" style={{ borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-lg)' }}>
                  <img src={homepageSettings.bannerImageUrl} alt={homepageSettings.bannerImageAlt || 'Crackers Hyderabad Banner'} loading="lazy" className="max-h-[400px] w-full object-cover sm:max-h-[500px]" />
                </ScrollReveal>
              </div>
            </section>
          ) : null}
          <TrustSection heading={homepageContent.trust} cards={trustCards} />
          <section className="section-pad" style={{ background: 'var(--surface-sunken)' }}>
            <div className="shell-wide">
              <div className="grid gap-6 lg:grid-cols-[48fr_52fr] lg:gap-6">
                <NewsletterBlock email={newsletterEmail} onEmailChange={(e) => setNewsletterEmail(e.target.value)} onSubmit={handleSubscribe} copy={newsletterCopy} />
                <TrackOrderBlock orderId={trackOrderId} onOrderIdChange={(e) => setTrackOrderId(e.target.value)} onSubmit={handleTrackOrder} />
              </div>
            </div>
          </section>
          <WholesaleSection copy={wholesaleCopy} />
        </>
      )}

      <Footer />
    </div>
  );
};

export default Home;
