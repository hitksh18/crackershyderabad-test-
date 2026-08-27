import { useEffect, useRef, useState } from 'react';
import { Fragment } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';

import Footer from '../components/Footer';
import ScrollReveal from '../components/ui/ScrollReveal';
import { Skeleton } from '../components/ui/Skeleton';

import HomeHero from '../components/home/HomeHero';
import CategoryShowcase from '../components/home/CategoryShowcase';
import DealsSection from '../components/home/DealsSection';
import FeaturedSection from '../components/home/FeaturedSection';
import HomeProductRail from '../components/home/HomeProductRail';
import WholesaleSection from '../components/home/WholesaleSection';
import PromoSection from '../components/home/PromoSection';
import TrustSection from '../components/home/TrustSection';
import NewsletterBlock from '../components/home/NewsletterBlock';
import TrackOrderBlock from '../components/home/TrackOrderBlock';
import { categoryDefs } from '../components/home/homeData';

import { useHomepageSettings } from '../hooks/useHomepageSettings';
import { readHomepageSections, DEFAULT_SECTION_ORDER } from '../lib/homepageSections';
import Seo from '../components/Seo';
import toast from '../utils/toast';

/* Admin-editable section copy; these are the defaults before the Canvas
   editor saves settings/homepageContent. */
const DEFAULT_CONTENT = {
  categories: {
    eyebrow: 'Explore',
    title: 'Shop by Categories',
    subtitle: 'Handpicked ranges for every celebration',
  },
  deals: {
    eyebrow: 'Festive Offers',
    title: 'Festive Deals',
    subtitle: 'Limited-time offers for every celebration',
  },
  featured: {
    eyebrow: 'Handpicked',
    title: 'Featured Products',
    subtitle: 'Our best-selling fireworks handpicked for you',
  },
  bestSellers: {
    eyebrow: 'Top Rated',
    title: 'Best Sellers',
    subtitle: 'The most-loved picks from real orders',
  },
  trust: {
    eyebrow: 'Why Us',
    title: 'Why Choose Crackers Hyderabad',
    subtitle: 'The city’s most trusted fireworks destination',
  },
};

/* Hero slides are small and rarely change; a local copy lets the first paint
   already show the real carousel instead of a blank shell while the Firestore
   fetch resolves. Best-effort: private mode or quota limits just skip it. */
const HERO_SLIDES_CACHE_KEY = 'ch:heroSlides:v1';

const readCachedSlides = () => {
  try {
    const raw = localStorage.getItem(HERO_SLIDES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const cacheSlides = (slides) => {
  try {
    localStorage.setItem(HERO_SLIDES_CACHE_KEY, JSON.stringify(slides));
  } catch {
    // Cache is best-effort; storage can be unavailable.
  }
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

  const [heroSettings, setHeroSettings] = useState({
    mainHeading: "Hyderabad's Premium Fireworks Store",
    mainHeadingSize: 'clamp(2.25rem, 1.55rem + 3.2vw, 3.75rem)',
    subHeading: 'Celebrate every occasion with premium quality crackers, exciting festival offers, and safe doorstep delivery.',
    subHeadingSize: 'clamp(1.05rem, 1.8vw, 1.3rem)',
    ctaText: 'Shop Crackers'
  });

  const [bannerSettings, setBannerSettings] = useState({
    banner1Text: 'Your trusted online fireworks store in Hyderabad — from premium gift boxes to everyday sparklers',
    banner1Enabled: true
  });

  // null until the heroSlides fetch resolves (or a cached copy is available),
  // so the hero never has to guess whether the carousel exists.
  const [heroSlides, setHeroSlides] = useState(readCachedSlides);
  const [festiveDeals, setFestiveDeals] = useState([]);
  const [homepageContent, setHomepageContent] = useState(DEFAULT_CONTENT);
  const [categoryShowcaseConfig, setCategoryShowcaseConfig] = useState(null);

  // Published homepage-section configuration, or null while unknown. A draft
  // (or absent) config falls back to the canonical default order.
  const [sectionConfig, setSectionConfig] = useState(null);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'products'));
        const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllProducts(all);
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    };

    const fetchPromotionalBanners = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'promotionalBanners'));
        const bannersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPromotionalBanners(bannersData.sort((a, b) => (b.order || 0) - (a.order || 0)));
      } catch (error) {
        console.error('Error fetching promotional banners:', error);
      }
    };

    const fetchHeroSlides = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'heroSlides'));
        const slides = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(s => s.enabled !== false)
          .sort((a, b) => (a.order || 0) - (b.order || 0));
        setHeroSlides(slides);
        cacheSlides(slides);
      } catch (error) {
        console.error('Error fetching hero slides:', error);
      }
    };

    const fetchFestiveDeals = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'festiveDeals'));
        const deals = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(d => d.enabled !== false)
          .sort((a, b) => (a.order || 0) - (b.order || 0));
        setFestiveDeals(deals);
      } catch (error) {
        console.error('Error fetching festive deals:', error);
      }
    };

    const fetchHomepageContent = async () => {
      try {
        const contentDoc = await getDoc(doc(db, 'settings', 'homepageContent'));
        if (contentDoc.exists()) {
          setHomepageContent(prev => deepMerge(prev, contentDoc.data()));
        }
      } catch (error) {
        console.error('Error fetching homepage content:', error);
      }
    };

    const fetchCategoryShowcase = async () => {
      try {
        const configDoc = await getDoc(doc(db, 'settings', 'categoryShowcase'));
        if (configDoc.exists()) {
          setCategoryShowcaseConfig(configDoc.data());
        }
      } catch (error) {
        console.error('Error fetching category showcase config:', error);
      }
    };

    const fetchHeroSettings = async () => {
      try {
        const heroDoc = await getDoc(doc(db, 'heroSettings', 'main'));
        if (heroDoc.exists()) {
          setHeroSettings(prev => ({ ...prev, ...heroDoc.data() }));
        }
      } catch (error) {
        console.error('Error fetching hero settings:', error);
      }
    };

    const fetchBannerSettings = async () => {
      try {
        const bannerDoc = await getDoc(doc(db, 'bannerSettings', 'main'));
        if (bannerDoc.exists()) {
          setBannerSettings(prev => ({ ...prev, ...bannerDoc.data() }));
        }
      } catch (error) {
        console.error('Error fetching banner settings:', error);
      }
    };

    const fetchSectionConfig = async () => {
      try {
        const config = await readHomepageSections();
        // Only a published configuration changes the storefront.
        setSectionConfig(config.status === 'published' ? config.sections : null);
      } catch (error) {
        console.error('Error fetching homepage sections:', error);
        setSectionConfig(null);
      }
    };

    fetchProducts();
    fetchPromotionalBanners();
    fetchHeroSlides();
    fetchFestiveDeals();
    fetchHomepageContent();
    fetchCategoryShowcase();
    fetchHeroSettings();
    fetchBannerSettings();
    fetchSectionConfig();
  }, []);

  const byAdminOrder = (a, b) =>
    (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) ||
    (b.salesCount || 0) - (a.salesCount || 0) ||
    (a.name || '').localeCompare(b.name || '');

  const featuredProducts = allProducts
    .filter(p => p.isFeatured)
    .concat(
      allProducts
        .filter(p => !p.isFeatured)
        .sort(byAdminOrder)
    )
    .slice(0, 12);

  // Best sellers come from real order data: the API increments salesCount on
  // every product when an order is placed. No manual selection here.
  const bestSellers = [...allProducts]
    .sort(
      (a, b) =>
        (b.salesCount || 0) - (a.salesCount || 0) ||
        (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) ||
        (a.name || '').localeCompare(b.name || '')
    )
    .slice(0, 10);

  const countInCategory = (matchNames) => {
    return allProducts.filter(p => {
      if (Array.isArray(p.categories)) {
        return p.categories.some(cat => matchNames.some(m => m.toLowerCase() === String(cat).toLowerCase()));
      }
      return matchNames.some(m => m.toLowerCase() === String(p.category || '').toLowerCase());
    }).length;
  };

  // Admin-controlled category visibility and order (settings/categoryShowcase).
  const visibleCategories = (() => {
    const cfg = categoryShowcaseConfig || {};
    const hidden = new Set(cfg.hidden || []);
    let list = categoryDefs.filter(cat => !hidden.has(cat.slug));
    if (Array.isArray(cfg.order) && cfg.order.length > 0) {
      const rank = new Map(cfg.order.map((slug, i) => [slug, i]));
      list = [...list].sort(
        (a, b) => (rank.get(a.slug) ?? 999) - (rank.get(b.slug) ?? 999)
      );
    }
    return list;
  })();

  const scrollToCategories = () => {
    categoriesRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

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
      // Router state, not the query string: a tracking code grants access to
      // the order, so it should not land in history or referrer headers.
      navigate('/track-order', { state: { code: trackOrderId.trim() } });
    }
  };

  const effectiveSections = sectionConfig || DEFAULT_SECTION_ORDER.map(id => ({ id, enabled: true }));
  const visibleSections = effectiveSections.filter(section => section.enabled);

  const renderSection = {
    hero: (
      <HomeHero
        slides={heroSlides}
        heroSettings={heroSettings}
        bannerSettings={bannerSettings}
        allProducts={allProducts}
        onBrowseCategories={scrollToCategories}
      />
    ),

    categories: (
      <CategoryShowcase
        sectionRef={categoriesRef}
        countInCategory={countInCategory}
        categories={visibleCategories}
        heading={homepageContent.categories}
      />
    ),

    deals: <DealsSection deals={festiveDeals} heading={homepageContent.deals} />,

    featured: (
      <FeaturedSection
        products={featuredProducts}
        heading={homepageContent.featured}
        loading={loading}
      />
    ),

    bestSellers: (
      <section className="section-pad" style={{ background: 'var(--surface-page)' }}>
        <div className="shell-wide">
          <HomeProductRail
            eyebrow={homepageContent.bestSellers.eyebrow}
            title={homepageContent.bestSellers.title}
            subtitle={homepageContent.bestSellers.subtitle}
            products={bestSellers}
            loading={loading}
            railLabel="best sellers"
          />
        </div>
      </section>
    ),

    promo: <PromoSection promotionalBanners={promotionalBanners} />,

    adminBanner:
      settingsLoading ? (
        <section className="section-pad-sm" style={{ background: 'var(--surface-card)' }}>
          <div className="shell-wide" role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">Loading homepage banner</span>
            <Skeleton className="h-56 w-full sm:h-72" rounded="var(--r-xl)" />
          </div>
        </section>
      ) : homepageSettings.bannerImageUrl ? (
        <section className="section-pad-sm" style={{ background: 'var(--surface-card)' }}>
          <div className="shell-wide">
            <ScrollReveal
              distance={20}
              className="overflow-hidden"
              style={{ borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-lg)' }}
            >
              <img
                src={homepageSettings.bannerImageUrl}
                alt={homepageSettings.bannerImageAlt || 'Crackers Hyderabad Banner'}
                loading="lazy"
                className="max-h-[400px] w-full object-cover sm:max-h-[500px]"
              />
            </ScrollReveal>
          </div>
        </section>
      ) : null,

    trust: <TrustSection heading={homepageContent.trust} />,

    newsletterTrack: (
      <section className="section-pad" style={{ background: 'var(--surface-sunken)' }}>
        <div className="shell-wide">
          <div className="grid gap-6 lg:grid-cols-[48fr_52fr] lg:gap-6">
            <NewsletterBlock
              email={newsletterEmail}
              onEmailChange={(e) => setNewsletterEmail(e.target.value)}
              onSubmit={handleSubscribe}
            />
            <TrackOrderBlock
              orderId={trackOrderId}
              onOrderIdChange={(e) => setTrackOrderId(e.target.value)}
              onSubmit={handleTrackOrder}
            />
          </div>
        </div>
      </section>
    ),

    wholesale: <WholesaleSection />,

    footer: <Footer />,
  };

  return (
    <div className="min-h-screen">
      <Seo
        title="Crackers Hyderabad — Premium Fireworks & Wholesale Crackers"
        description="Premium fireworks and wholesale crackers in Hyderabad. Gift boxes, sparklers, rockets, flower pots and festival collections at wholesale pricing, with order tracking and doorstep delivery."
        canonical="/"
      />
      {visibleSections.map((section) => (
        <Fragment key={section.id}>{renderSection[section.id]}</Fragment>
      ))}
    </div>
  );
};

/* Shallow-merge per section group, so a stored doc may override only some
   groups and some fields without losing the rest of the defaults. */
const deepMerge = (base, override) => {
  const out = { ...base };
  for (const key of Object.keys(override)) {
    const baseValue = base[key];
    const overrideValue = override[key];
    if (
      baseValue &&
      overrideValue &&
      typeof baseValue === 'object' &&
      typeof overrideValue === 'object'
    ) {
      out[key] = { ...baseValue, ...overrideValue };
    } else {
      out[key] = overrideValue;
    }
  }
  return out;
};

export default Home;