import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { doc, getDoc, setDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { uploadImage } from '../utils/uploadImage';
import toast from '../utils/toast';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { pageVariants, revealVariants, DURATION, EASE_OUT_EXPO } from '../lib/motion';
import {
  Save,
  Image as ImageIcon,
  Type,
  Palette,
  Eye,
  Upload,
  Loader2,
  Trash2,
  SlidersHorizontal,
  MessageSquare,
  IndianRupee,
  Megaphone,
  MonitorSmartphone,
  LayoutTemplate,
  ArrowDown,
  ArrowUp,
  Send,
  Plus,
  Images,
  BadgePercent,
  LayoutGrid,
  FileText,
  MapPin
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { readHomepageSections, saveHomepageSections, SECTION_META } from '../lib/homepageSections';
import { DEAL_ICON_OPTIONS } from '../lib/dealIcons';
import { categoryDefs } from '../components/home/homeData';
import { authFetch } from '../utils/apiClient';

/* -------------------------------------------------------------------------
   Presentational primitives for this screen only.
   None of these hold state — they are layout and typography wrappers.
   ------------------------------------------------------------------------- */

const GroupHeading = ({ icon: Icon, title, description }) => (
  <div className="flex items-start gap-3">
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
      style={{ background: 'rgba(210, 166, 79, 0.14)', border: '1px solid rgba(190, 140, 54, 0.28)' }}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} style={{ color: 'var(--gold-600)' }} />
    </span>
    <div className="min-w-0">
      <h3 className="card-title" style={{ color: 'var(--text-strong)' }}>{title}</h3>
      {description && (
        <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{description}</p>
      )}
    </div>
  </div>
);

const ControlGroup = ({ icon, title, description, children }) => (
  <section
    className="p-4 sm:p-5"
    style={{
      background: 'var(--surface-sunken)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--r-lg)'
    }}
  >
    <GroupHeading icon={icon} title={title} description={description} />
    <div className="mt-5 space-y-5">{children}</div>
  </section>
);

const TextField = ({ id, label, hint, rows, className = '', ...inputProps }) => (
  <div>
    <label htmlFor={id} className="label-caps block">{label}</label>
    {rows ? (
      <textarea id={id} rows={rows} className={`input-premium mt-2 block w-full ${className}`} {...inputProps} />
    ) : (
      <input id={id} className={`input-premium mt-2 block w-full ${className}`} {...inputProps} />
    )}
    {hint && (
      <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-subtle)' }}>{hint}</p>
    )}
  </div>
);

const SliderField = ({ id, label, display, hint, ...inputProps }) => (
  <div>
    <div className="flex items-baseline justify-between gap-3">
      <label htmlFor={id} className="label-caps">{label}</label>
      <span className="tabular text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>{display}</span>
    </div>
    <input
      id={id}
      type="range"
      className="mt-1 h-11 w-full cursor-pointer bg-transparent"
      style={{ accentColor: 'var(--ember-600)' }}
      {...inputProps}
    />
    {hint && <p className="text-xs leading-relaxed" style={{ color: 'var(--text-subtle)' }}>{hint}</p>}
  </div>
);

const ToggleRow = ({ id, label, hint, ...inputProps }) => (
  <div
    className="flex min-h-[44px] items-start gap-3 px-3 py-3"
    style={{
      background: 'var(--surface-card)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--r-md)'
    }}
  >
    <input
      id={id}
      type="checkbox"
      className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer"
      style={{ accentColor: 'var(--ember-600)' }}
      {...inputProps}
    />
    <label
      htmlFor={id}
      className="min-w-0 flex-1 cursor-pointer text-sm font-semibold"
      style={{ color: 'var(--text-body)' }}
    >
      {label}
      {hint && (
        <span className="mt-0.5 block text-xs font-normal" style={{ color: 'var(--text-subtle)' }}>{hint}</span>
      )}
    </label>
  </div>
);

const UploadField = ({ id, onChange, children, dense = false }) => (
  <div>
    <input id={id} type="file" accept="image/*" onChange={onChange} className="peer sr-only" />
    <label
      htmlFor={id}
      className={`${dense ? 'btn-quiet' : 'btn-outline'} min-h-[44px] w-full cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-primary-600`}
    >
      <Upload className="h-4 w-4" aria-hidden="true" />
      {children}
    </label>
  </div>
);

const PreviewThumb = ({ label, src, alt, contain = false }) => (
  <div>
    <p className="label-caps">{label}</p>
    <div
      className="mt-2 overflow-hidden"
      style={{
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--r-md)',
        background: 'var(--surface-sunken)'
      }}
    >
      <img
        src={src}
        alt={alt}
        className={contain ? 'h-24 w-full object-contain p-3' : 'h-32 w-full object-cover'}
      />
    </div>
  </div>
);

const PanelEmpty = ({ icon: Icon, title, description }) => (
  <div
    className="flex flex-col items-center px-5 py-12 text-center sm:px-8"
    style={{
      background: 'var(--surface-sunken)',
      border: '1px dashed var(--hairline-strong)',
      borderRadius: 'var(--r-lg)'
    }}
  >
    <span
      aria-hidden="true"
      className="mb-4 flex h-14 w-14 items-center justify-center rounded-full"
      style={{ background: 'rgba(210, 166, 79, 0.12)', border: '1px solid rgba(190, 140, 54, 0.28)' }}
    >
      <Icon className="h-6 w-6" strokeWidth={1.6} style={{ color: 'var(--gold-600)' }} />
    </span>
    <h4 className="card-title" style={{ color: 'var(--text-strong)' }}>{title}</h4>
    <p className="mt-2 max-w-prose text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
      {description}
    </p>
  </div>
);

const SaveLabel = ({ saving, idle, busy = 'Saving...' }) => (
  <>
    {saving ? (
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
    ) : (
      <Save className="h-4 w-4" aria-hidden="true" />
    )}
    {saving ? busy : idle}
  </>
);

const CanvasEditor = () => {
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('hero');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [sectionItems, setSectionItems] = useState([]);
  const [sectionStatus, setSectionStatus] = useState('draft');

  const [heroSettings, setHeroSettings] = useState({
    backgroundImage: '/images/hero-bg.jpg',
    backgroundOverlay: 0.5,
    liveMotion: true,
    logoImage: '/images/website/standard-logo.png',
    logoSize: 34,
    leftLogoImage: '',
    rightLogoImage: '',
    sideLogoSize: 15,
    mainHeading: 'Crackers Hyderabad',
    mainHeadingSize: 'clamp(2.25rem, 5.5vw, 3rem)',
    subHeading: 'Standard Fireworks Exclusive Store',
    subHeadingSize: 'clamp(1.15rem, 2.8vw, 1.4rem)',
    subtitle: 'CELEBRATE EVERY FESTIVAL AND EVENT WITH DAZZLING LIGHTS AND SPARKLING SHOWERS ONLY WITH US',
    subtitleSize: 'clamp(0.95rem, 2.2vw, 1.15rem)',
    ctaText: 'Shop Crackers',
    brightness: 100,
    lineSpacing: 20,
    badgeSpacing: 24
  });

  const [footerSettings, setFooterSettings] = useState({
    shopName: 'Crackers Hyderabad',
    tagline: 'Your Trusted Fireworks Store in Hyderabad',
    address: 'Hyderabad, Telangana',
    phone: '+91 1234567890',
    email: 'info@crackershyderabad.com',
    showSocialLinks: true
  });

  const [bannerSettings, setBannerSettings] = useState({
    topBannerText: 'Free Shipping & COD for orders above ₹2,500',
    topBannerEnabled: true,
    banner1Text: 'Your trusted online fireworks store in Hyderabad — from premium gift boxes to everyday sparklers',
    banner1Enabled: true
  });

  const [adminSettings, setAdminSettings] = useState({
    whatsappNumber: '+91 1234567890',
    whatsappEnabled: true,
    minimumOrderValue: 500,
    minimumOrderValueEnabled: true,
    deliveryPinEnabled: true
  });
  /* Which geocoding provider the server is actually using. Reported by the API
     rather than stored here, because the Google key lives in a server env var —
     adminSettings/main is world-readable to the storefront, so a key saved into
     it would be a key published to everyone. */
  const [geocodeConfig, setGeocodeConfig] = useState(null);

  const [heroSlides, setHeroSlides] = useState([]);
  const [festiveDeals, setFestiveDeals] = useState([]);
  const [categoryConfig, setCategoryConfig] = useState({ order: [], hidden: [] });
  const [homepageContent, setHomepageContent] = useState({
    categories: { eyebrow: 'Explore', title: 'Shop by Categories', subtitle: 'Handpicked ranges for every celebration' },
    deals: { eyebrow: 'Festive Offers', title: 'Festive Deals', subtitle: 'Limited-time offers for every celebration' },
    featured: { eyebrow: 'Handpicked', title: 'Featured Products', subtitle: 'Our best-selling fireworks handpicked for you' },
    bestSellers: { eyebrow: 'Top Rated', title: 'Best Sellers', subtitle: 'The most-loved picks from real orders' },
    trust: { eyebrow: 'Why Us', title: 'Why Choose Crackers Hyderabad', subtitle: 'The city’s most trusted fireworks destination' }
  });
  const heroSlideLoadedIds = useRef([]);
  const dealLoadedIds = useRef([]);

  useEffect(() => {
    loadSettings();
  }, []);

  /* Read once on mount. Failure is silent by design: not knowing which provider
     is live is a missing caption, not a broken settings screen. */
  useEffect(() => {
    let cancelled = false;

    authFetch('/api/geocode/config')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data) setGeocodeConfig(data);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const loadSettings = async () => {
    try {
      const [heroDoc, footerDoc, bannerDoc, adminDoc] = await Promise.all([
        getDoc(doc(db, 'heroSettings', 'main')),
        getDoc(doc(db, 'footerSettings', 'main')),
        getDoc(doc(db, 'bannerSettings', 'main')),
        getDoc(doc(db, 'adminSettings', 'main'))
      ]);
      if (heroDoc.exists()) {
        setHeroSettings(prev => ({ ...prev, ...heroDoc.data() }));
      }
      if (footerDoc.exists()) {
        setFooterSettings(prev => ({ ...prev, ...footerDoc.data() }));
      }
      if (bannerDoc.exists()) {
        setBannerSettings(prev => ({ ...prev, ...bannerDoc.data() }));
      }
      if (adminDoc.exists()) {
        const data = adminDoc.data();
        const migratedData = { ...data };

        if ('minimumOrderValueLocked' in data && !('minimumOrderValueEnabled' in data)) {
          migratedData.minimumOrderValueEnabled = data.minimumOrderValueLocked !== false;
          delete migratedData.minimumOrderValueLocked;
        }

        setAdminSettings(prev => ({ ...prev, ...migratedData }));
      }

      const config = await readHomepageSections();
      setSectionItems(config.sections);
      setSectionStatus(config.status);

      const [slidesSnap, dealsSnap, categoryDoc, contentDoc] = await Promise.all([
        getDocs(collection(db, 'heroSlides')),
        getDocs(collection(db, 'festiveDeals')),
        getDoc(doc(db, 'settings', 'categoryShowcase')),
        getDoc(doc(db, 'settings', 'homepageContent'))
      ]);
      const slides = slidesSnap.docs
        .map(s => ({ id: s.id, ...s.data() }))
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      const deals = dealsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      setHeroSlides(slides);
      setFestiveDeals(deals);
      heroSlideLoadedIds.current = slides.map(s => s.id);
      dealLoadedIds.current = deals.map(d => d.id);

      if (categoryDoc.exists()) {
        const data = categoryDoc.data();
        setCategoryConfig({
          order: Array.isArray(data.order) ? data.order : [],
          hidden: Array.isArray(data.hidden) ? data.hidden : []
        });
      }
      if (contentDoc.exists()) {
        setHomepageContent(prev => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(contentDoc.data()).map(([key, value]) => [
              key,
              { ...(prev[key] || {}), ...value }
            ])
          )
        }));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast.info('Could not load saved settings — showing defaults');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveHero = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'heroSettings', 'main'), heroSettings);
      toast.success('Hero settings saved successfully!');
    } catch (error) {
      console.error('Error saving hero settings:', error);
      toast.error('Failed to save hero settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFooter = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'footerSettings', 'main'), footerSettings);
      toast.success('Footer settings saved successfully!');
    } catch (error) {
      console.error('Error saving footer settings:', error);
      toast.error('Failed to save footer settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBanner = async () => {
    setSaving(true);
    try {
      // Merge rather than overwrite: the document may still carry fields this
      // editor no longer manages (the retired Alert 2 pair), and a failed load
      // must never let a subsequent save wipe them.
      await setDoc(doc(db, 'bannerSettings', 'main'), bannerSettings, { merge: true });
      toast.success('Banner settings saved successfully!');
    } catch (error) {
      console.error('Error saving banner settings:', error);
      toast.error('Failed to save banner settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAdmin = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'adminSettings', 'main'), adminSettings);
      toast.success('Admin settings saved successfully!');
    } catch (error) {
      console.error('Error saving admin settings:', error);
      toast.error('Failed to save admin settings');
    } finally {
      setSaving(false);
    }
  };

  /* ---- Hero slides ---- */

  const addHeroSlide = () => {
    setHeroSlides(prev => [
      ...prev,
      {
        id: `slide-${Date.now()}`,
        imageUrl: '',
        eyebrow: 'Festival Offer',
        heading: '',
        subHeading: '',
        ctaText: 'Shop Crackers',
        ctaLink: '/products',
        enabled: true,
      },
    ]);
  };

  const updateHeroSlide = (index, patch) => {
    setHeroSlides(prev => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const removeHeroSlide = (index) => {
    setHeroSlides(prev => prev.filter((_, i) => i !== index));
  };

  const handleSlideImageUpload = async (index, e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    const loadingToast = toast.loading('Uploading image...');
    try {
      const downloadURL = await uploadImage(file, { upscale: false, watermark: false });
      updateHeroSlide(index, { imageUrl: downloadURL });
      toast.success('Image uploaded successfully!', { id: loadingToast });
    } catch (error) {
      console.error('Error uploading slide image:', error);
      toast.error('Failed to upload image', { id: loadingToast });
    } finally {
      e.target.value = '';
    }
  };

  const handleSaveHeroSlides = async () => {
    setSaving(true);
    try {
      const writeOps = heroSlides.map((slide, index) =>
        setDoc(doc(db, 'heroSlides', slide.id), { ...slide, order: index })
      );
      const removed = heroSlideLoadedIds.current.filter(
        id => !heroSlides.some(s => s.id === id)
      );
      const deleteOps = removed.map(id => deleteDoc(doc(db, 'heroSlides', id)));
      await Promise.all([...writeOps, ...deleteOps]);
      heroSlideLoadedIds.current = heroSlides.map(s => s.id);
      toast.success('Hero slides saved successfully!');
    } catch (error) {
      console.error('Error saving hero slides:', error);
      toast.error('Failed to save hero slides');
    } finally {
      setSaving(false);
    }
  };

  /* ---- Festive deals ---- */

  const addDeal = () => {
    setFestiveDeals(prev => [
      ...prev,
      {
        id: `deal-${Date.now()}`,
        icon: 'Gift',
        offerText: 'Festive Offer',
        title: '',
        description: '',
        ctaText: 'Shop Now',
        ctaLink: '/products',
        gradientFrom: '#C33A14',
        gradientTo: '#DF4C21',
        enabled: true,
      },
    ]);
  };

  const updateDeal = (index, patch) => {
    setFestiveDeals(prev => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const removeDeal = (index) => {
    setFestiveDeals(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveDeals = async () => {
    setSaving(true);
    try {
      const writeOps = festiveDeals.map((deal, index) =>
        setDoc(doc(db, 'festiveDeals', deal.id), { ...deal, order: index })
      );
      const removed = dealLoadedIds.current.filter(
        id => !festiveDeals.some(d => d.id === id)
      );
      const deleteOps = removed.map(id => deleteDoc(doc(db, 'festiveDeals', id)));
      await Promise.all([...writeOps, ...deleteOps]);
      dealLoadedIds.current = festiveDeals.map(d => d.id);
      toast.success('Festive deals saved successfully!');
    } catch (error) {
      console.error('Error saving festive deals:', error);
      toast.error('Failed to save festive deals');
    } finally {
      setSaving(false);
    }
  };

  /* ---- Category showcase visibility & order ---- */

  const moveCategory = (index, delta) => {
    setCategoryConfig(prev => {
      const next = [...prev.order];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, order: next };
    });
  };

  const toggleCategory = (slug, hidden) => {
    setCategoryConfig(prev => {
      const hiddenSet = new Set(prev.hidden);
      if (hidden) hiddenSet.add(slug);
      else hiddenSet.delete(slug);
      return { ...prev, hidden: [...hiddenSet] };
    });
  };

  const handleSaveCategories = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'categoryShowcase'), {
        order: categoryConfig.order,
        hidden: categoryConfig.hidden,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || 'admin'
      });
      toast.success('Category showcase saved successfully!');
    } catch (error) {
      console.error('Error saving category showcase:', error);
      toast.error('Failed to save category showcase');
    } finally {
      setSaving(false);
    }
  };

  /* ---- Section copy ---- */

  const updateContent = (group, field, value) => {
    setHomepageContent(prev => ({
      ...prev,
      [group]: { ...prev[group], [field]: value }
    }));
  };

  const handleSaveContent = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'homepageContent'), homepageContent, { merge: true });
      toast.success('Section text saved successfully!');
    } catch (error) {
      console.error('Error saving section text:', error);
      toast.error('Failed to save section text');
    } finally {
      setSaving(false);
    }
  };

  /* ---- Shared list helpers ---- */

  const moveItem = (list, setList, index, delta) => {
    setList(prev => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const toggleItem = (list, setList, index) => {
    setList(prev => prev.map((item, i) =>
      i === index ? { ...item, enabled: !item.enabled } : item
    ));
  };

  const handleSaveAll = async () => {
    switch(activeTab) {
      case 'hero':
        await handleSaveHero();
        break;
      case 'heroSlides':
        await handleSaveHeroSlides();
        break;
      case 'deals':
        await handleSaveDeals();
        break;
      case 'categories':
        await handleSaveCategories();
        break;
      case 'content':
        await handleSaveContent();
        break;
      case 'banner':
        await handleSaveBanner();
        break;
      case 'footer':
        await handleSaveFooter();
        break;
      case 'admin':
        await handleSaveAdmin();
        break;
      case 'sections':
        await handleSaveSections('draft');
        break;
      default:
        break;
    }
  };

  const handleSaveSections = async (status) => {
    setSaving(true);
    try {
      const ordered = await saveHomepageSections(sectionItems, status, user?.email);
      setSectionItems(ordered);
      setSectionStatus(status);
      toast.success(status === 'published' ? 'Homepage published!' : 'Section order saved as draft');
    } catch (error) {
      console.error('Error saving homepage sections:', error);
      toast.error('Failed to save section order');
    } finally {
      setSaving(false);
    }
  };

  const handlePublishSections = async () => {
    setPublishing(true);
    try {
      const ordered = await saveHomepageSections(sectionItems, 'published', user?.email);
      setSectionItems(ordered);
      setSectionStatus('published');
      toast.success('Homepage published — customers now see this order');
    } catch (error) {
      console.error('Error publishing homepage sections:', error);
      toast.error('Failed to publish homepage');
    } finally {
      setPublishing(false);
    }
  };

  const moveSection = (index, delta) => {
    setSectionItems(prev => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const locked = (s) => s.id === 'hero' || s.id === 'wholesale' || s.id === 'footer';
      if (locked(next[index]) || locked(next[target])) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const toggleSection = (id, enabled) => {
    setSectionItems(prev => prev.map(s => (s.id === id ? { ...s, enabled } : s)));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    const loadingToast = toast.loading('Uploading image...');
    try {
      const downloadURL = await uploadImage(file, { upscale: false, watermark: false });

      setHeroSettings(prev => ({ ...prev, backgroundImage: downloadURL }));
      toast.success('Image uploaded successfully!', { id: loadingToast });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to upload image', { id: loadingToast });
    } finally {
      e.target.value = '';
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    const loadingToast = toast.loading('Uploading logo...');
    try {
      const downloadURL = await uploadImage(file, { upscale: false, watermark: false });

      setHeroSettings(prev => ({ ...prev, logoImage: downloadURL }));
      toast.success('Logo uploaded successfully!', { id: loadingToast });
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Failed to upload logo', { id: loadingToast });
    } finally {
      e.target.value = '';
    }
  };

  const handleLeftLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    const loadingToast = toast.loading('Uploading left logo...');
    try {
      const downloadURL = await uploadImage(file, { upscale: false, watermark: false });

      setHeroSettings(prev => ({ ...prev, leftLogoImage: downloadURL }));
      toast.success('Left logo uploaded successfully!', { id: loadingToast });
    } catch (error) {
      console.error('Error uploading left logo:', error);
      toast.error('Failed to upload left logo', { id: loadingToast });
    } finally {
      e.target.value = '';
    }
  };

  const handleRightLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    const loadingToast = toast.loading('Uploading right logo...');
    try {
      const downloadURL = await uploadImage(file, { upscale: false, watermark: false });

      setHeroSettings(prev => ({ ...prev, rightLogoImage: downloadURL }));
      toast.success('Right logo uploaded successfully!', { id: loadingToast });
    } catch (error) {
      console.error('Error uploading right logo:', error);
      toast.error('Failed to upload right logo', { id: loadingToast });
    } finally {
      e.target.value = '';
    }
  };

  const tabs = [
    { id: 'hero', label: 'Hero Section', icon: ImageIcon },
    { id: 'heroSlides', label: 'Hero Slides', icon: Images },
    { id: 'deals', label: 'Festive Deals', icon: BadgePercent },
    { id: 'sections', label: 'Page Sections', icon: LayoutTemplate },
    { id: 'categories', label: 'Categories', icon: LayoutGrid },
    { id: 'content', label: 'Section Text', icon: FileText },
    { id: 'banner', label: 'Alerts', icon: Palette },
    { id: 'footer', label: 'Footer', icon: Type },
    { id: 'admin', label: 'Admin Settings', icon: Save }
  ];

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4"
        style={{ background: 'var(--surface-page)' }}
      >
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="panel-editorial flex flex-col items-center px-8 py-12 text-center"
        >
          <Loader2 className="h-8 w-8 animate-spin" strokeWidth={1.8} style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
          <p className="mt-4 text-sm font-semibold" style={{ color: 'var(--text-body)' }}>
            Loading Canvas Editor...
          </p>
        </div>
      </div>
    );
  }

  const activeTabLabel = tabs.find(tab => tab.id === activeTab)?.label || '';
  const anyAlertEnabled = bannerSettings.topBannerEnabled || bannerSettings.banner1Enabled;

  return (
    <motion.div
      className="min-h-screen"
      style={{ background: 'var(--surface-page)' }}
      variants={pageVariants(reduced)}
      initial="initial"
      animate="animate"
    >
      {/* Sticky Save Button - Floating */}
      <motion.button
        onClick={handleSaveAll}
        disabled={saving}
        aria-label={saving ? 'Saving changes' : `Save ${activeTabLabel} changes`}
        aria-busy={saving}
        whileHover={reduced ? undefined : { scale: 1.04 }}
        whileTap={reduced ? undefined : { scale: 0.96 }}
        className="btn-primary fixed bottom-5 right-5 z-sticky px-5"
        style={{ borderRadius: 'var(--r-pill)' }}
        initial={{ opacity: 0, y: reduced ? 0 : 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: reduced ? 0.001 : DURATION.base,
          ease: EASE_OUT_EXPO,
          delay: reduced ? 0 : 0.2
        }}
      >
        <SaveLabel saving={saving} idle="Save" />
      </motion.button>

      <div className="shell section-pad-sm">
        <motion.header
          variants={revealVariants(reduced, 14)}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="min-w-0">
            <span className="section-eyebrow">Site appearance</span>
            <h1 className="section-title mt-3">Canvas Editor</h1>
            <p className="mt-2 max-w-prose text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Customize your website appearance with live preview
            </p>
          </div>

          <motion.button
            onClick={handleSaveAll}
            disabled={saving}
            aria-busy={saving}
            whileHover={reduced ? undefined : { y: -2 }}
            whileTap={reduced ? undefined : { scale: 0.98 }}
            className="btn-primary hidden shrink-0 md:inline-flex"
          >
            <SaveLabel saving={saving} idle="Save Changes" />
          </motion.button>
        </motion.header>

        {/* Tabs */}
        <div className="scroll-x mt-7 pb-1" aria-label="Editor sections" role="group">
          <div className="flex w-max gap-2">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-pressed={isActive}
                  className={`flex min-h-[44px] items-center gap-2 whitespace-nowrap px-4 text-sm font-semibold ${isActive ? '' : 'editor-tab-inactive'}`}
                  style={{
                    borderRadius: 'var(--r-md)',
                    background: isActive ? 'var(--grad-ember)' : undefined,
                    color: isActive ? '#FFFFFF' : undefined,
                    border: isActive ? '1px solid transparent' : undefined,
                    boxShadow: isActive ? 'var(--shadow-sm)' : undefined,
                    transition: 'background var(--dur-fast) var(--ease-out-soft), color var(--dur-fast) var(--ease-out-soft), box-shadow var(--dur-fast) var(--ease-out-soft)'
                  }}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Editor Panel */}
          <motion.div
            variants={revealVariants(reduced, 18)}
            initial="hidden"
            animate="visible"
            className="panel-editorial min-w-0 p-5 sm:p-7"
          >
            {activeTab === 'hero' && (
              <div className="space-y-6">
                <div>
                  <p className="label-caps">Section</p>
                  <h2 className="subsection-title mt-1">Hero Section Settings</h2>
                </div>

                <ControlGroup
                  icon={ImageIcon}
                  title="Background Image"
                  description="Upload a background, or point the hero at an existing image URL."
                >
                  <UploadField id="imageUpload" onChange={handleImageUpload}>
                    Upload Background Image
                  </UploadField>

                  <TextField
                    id="heroBackgroundUrl"
                    label="Or enter image URL"
                    type="text"
                    value={heroSettings.backgroundImage}
                    onChange={(e) => setHeroSettings(prev => ({ ...prev, backgroundImage: e.target.value }))}
                    placeholder="/images/hero-bg.jpg or https://..."
                  />

                  {heroSettings.backgroundImage && (
                    <PreviewThumb
                      label="Current background"
                      src={heroSettings.backgroundImage}
                      alt="Background preview"
                    />
                  )}

                  <SliderField
                    id="heroOverlay"
                    label="Background Overlay"
                    display={heroSettings.backgroundOverlay.toFixed(2)}
                    min="0"
                    max="1"
                    step="0.05"
                    value={heroSettings.backgroundOverlay}
                    onChange={(e) => setHeroSettings(prev => ({ ...prev, backgroundOverlay: parseFloat(e.target.value) }))}
                  />

                  <SliderField
                    id="heroBrightness"
                    label="Brightness"
                    display={`${heroSettings.brightness}%`}
                    min="50"
                    max="150"
                    step="5"
                    value={heroSettings.brightness}
                    onChange={(e) => setHeroSettings(prev => ({ ...prev, brightness: parseInt(e.target.value) }))}
                  />

                  <ToggleRow
                    id="liveMotion"
                    label="Enable Live Motion Background"
                    checked={heroSettings.liveMotion}
                    onChange={(e) => setHeroSettings(prev => ({ ...prev, liveMotion: e.target.checked }))}
                  />
                </ControlGroup>

                <ControlGroup
                  icon={ImageIcon}
                  title="Logo Image"
                  description="The primary logo shown at the top of the hero."
                >
                  <UploadField id="logoUpload" onChange={handleLogoUpload}>
                    Upload Logo
                  </UploadField>

                  <TextField
                    id="heroLogoUrl"
                    label="Or enter logo URL"
                    type="text"
                    value={heroSettings.logoImage}
                    onChange={(e) => setHeroSettings(prev => ({ ...prev, logoImage: e.target.value }))}
                    placeholder="/images/website/standard-logo.png or https://..."
                  />

                  {heroSettings.logoImage && (
                    <PreviewThumb
                      label="Current logo"
                      src={heroSettings.logoImage}
                      alt="Logo preview"
                      contain
                    />
                  )}

                  <SliderField
                    id="heroLogoSize"
                    label="Logo Size"
                    display={`${heroSettings.logoSize}vw`}
                    min="20"
                    max="35"
                    step="1"
                    value={heroSettings.logoSize}
                    onChange={(e) => setHeroSettings(prev => ({ ...prev, logoSize: parseInt(e.target.value) }))}
                  />
                </ControlGroup>

                <ControlGroup
                  icon={ImageIcon}
                  title="Side Logos (Optional)"
                  description="Add optional brand logos on left and right sides of the main logo for additional branding"
                >
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-3">
                      <p className="label-caps">Left Logo</p>
                      <UploadField id="leftLogoUpload" onChange={handleLeftLogoUpload} dense>
                        Upload Left Logo
                      </UploadField>
                      <label htmlFor="heroLeftLogoUrl" className="sr-only">Left logo URL</label>
                      <input
                        id="heroLeftLogoUrl"
                        type="text"
                        value={heroSettings.leftLogoImage}
                        onChange={(e) => setHeroSettings(prev => ({ ...prev, leftLogoImage: e.target.value }))}
                        className="input-premium block w-full text-sm"
                        placeholder="Or enter URL..."
                      />
                      {heroSettings.leftLogoImage && (
                        <button
                          type="button"
                          onClick={() => setHeroSettings(prev => ({ ...prev, leftLogoImage: '' }))}
                          className="btn-quiet min-h-[44px] w-full"
                          style={{ color: 'var(--crimson-600)' }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Remove Left Logo
                        </button>
                      )}
                    </div>

                    <div className="space-y-3">
                      <p className="label-caps">Right Logo</p>
                      <UploadField id="rightLogoUpload" onChange={handleRightLogoUpload} dense>
                        Upload Right Logo
                      </UploadField>
                      <label htmlFor="heroRightLogoUrl" className="sr-only">Right logo URL</label>
                      <input
                        id="heroRightLogoUrl"
                        type="text"
                        value={heroSettings.rightLogoImage}
                        onChange={(e) => setHeroSettings(prev => ({ ...prev, rightLogoImage: e.target.value }))}
                        className="input-premium block w-full text-sm"
                        placeholder="Or enter URL..."
                      />
                      {heroSettings.rightLogoImage && (
                        <button
                          type="button"
                          onClick={() => setHeroSettings(prev => ({ ...prev, rightLogoImage: '' }))}
                          className="btn-quiet min-h-[44px] w-full"
                          style={{ color: 'var(--crimson-600)' }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Remove Right Logo
                        </button>
                      )}
                    </div>
                  </div>

                  <SliderField
                    id="heroSideLogoSize"
                    label="Side Logo Size"
                    display={`${heroSettings.sideLogoSize}vw`}
                    min="10"
                    max="25"
                    step="1"
                    value={heroSettings.sideLogoSize}
                    onChange={(e) => setHeroSettings(prev => ({ ...prev, sideLogoSize: parseInt(e.target.value) }))}
                  />
                </ControlGroup>

                <ControlGroup
                  icon={SlidersHorizontal}
                  title="Spacing Controls"
                  description="Adjust spacing between hero elements for perfect alignment"
                >
                  <SliderField
                    id="heroLineSpacing"
                    label="Line Spacing"
                    display={`${heroSettings.lineSpacing}px`}
                    min="10"
                    max="40"
                    step="2"
                    value={heroSettings.lineSpacing}
                    onChange={(e) => setHeroSettings(prev => ({ ...prev, lineSpacing: parseInt(e.target.value) }))}
                    hint="Spacing between logo, headings, and subtitle"
                  />

                  <SliderField
                    id="heroBadgeSpacing"
                    label="Trust Badge Spacing"
                    display={`${heroSettings.badgeSpacing}px`}
                    min="0"
                    max="50"
                    step="2"
                    value={heroSettings.badgeSpacing}
                    onChange={(e) => setHeroSettings(prev => ({ ...prev, badgeSpacing: parseInt(e.target.value) }))}
                    hint="Space above trust badges (100% Authentic, etc.)"
                  />
                </ControlGroup>

                <ControlGroup
                  icon={Type}
                  title="Text Content"
                  description="Edit all text content displayed in the hero section"
                >
                  <TextField
                    id="heroMainHeading"
                    label="Main Heading"
                    type="text"
                    value={heroSettings.mainHeading}
                    onChange={(e) => setHeroSettings(prev => ({ ...prev, mainHeading: e.target.value }))}
                  />

                  <TextField
                    id="heroSubHeading"
                    label="Sub Heading"
                    type="text"
                    value={heroSettings.subHeading}
                    onChange={(e) => setHeroSettings(prev => ({ ...prev, subHeading: e.target.value }))}
                  />

                  <TextField
                    id="heroSubtitle"
                    label="Subtitle"
                    rows="2"
                    value={heroSettings.subtitle}
                    onChange={(e) => setHeroSettings(prev => ({ ...prev, subtitle: e.target.value }))}
                  />

                  <TextField
                    id="heroCtaText"
                    label="CTA Button Text"
                    type="text"
                    value={heroSettings.ctaText}
                    onChange={(e) => setHeroSettings(prev => ({ ...prev, ctaText: e.target.value }))}
                  />
                </ControlGroup>

                <button
                  type="button"
                  onClick={handleSaveHero}
                  disabled={saving}
                  aria-busy={saving}
                  className="btn-primary w-full"
                >
                  <SaveLabel saving={saving} idle="Save Hero Settings" />
                </button>
              </div>
            )}

            {activeTab === 'banner' && (
              <div className="space-y-6">
                <div>
                  <p className="label-caps">Section</p>
                  <h2 className="subsection-title mt-1">Alerts Settings</h2>
                </div>

                {/* Top Alert (Above Hero) */}
                <ControlGroup
                  icon={Megaphone}
                  title="Top Alert (Above Header)"
                  description="Scrolling announcement bar shown above the navigation"
                >
                  <ToggleRow
                    id="topBannerEnabled"
                    label="Enable Top Alert"
                    checked={bannerSettings.topBannerEnabled}
                    onChange={(e) => setBannerSettings(prev => ({ ...prev, topBannerEnabled: e.target.checked }))}
                  />

                  <TextField
                    id="topBannerMessages"
                    label="Scrolling Messages (one per line)"
                    rows="5"
                    value={(bannerSettings.topBannerMessages || []).join('\n')}
                    onChange={(e) => setBannerSettings(prev => ({
                      ...prev,
                      topBannerMessages: e.target.value.split('\n').map(s => s.trim()).filter(Boolean)
                    }))}
                    placeholder={'Free Delivery above Rs. 2,000\n100% Licensed Products\nSecure Payments\nFestival Offers Live'}
                    hint="Each line becomes a message scrolling across the thin bar. Leave empty to fall back to the legacy single message below."
                  />

                  <TextField
                    id="topBannerText"
                    label="Legacy Single Message (fallback)"
                    type="text"
                    value={bannerSettings.topBannerText}
                    onChange={(e) => setBannerSettings(prev => ({ ...prev, topBannerText: e.target.value }))}
                    placeholder="e.g., Free Shipping & COD Available"
                  />
                </ControlGroup>

                {/* Banner 1 (Below Hero - Static) */}
                <ControlGroup
                  icon={Megaphone}
                  title="Alert 1 (Below Hero - Static)"
                  description="Trust message banner, static position"
                >
                  <ToggleRow
                    id="banner1Enabled"
                    label="Enable Alert 1"
                    checked={bannerSettings.banner1Enabled}
                    onChange={(e) => setBannerSettings(prev => ({ ...prev, banner1Enabled: e.target.checked }))}
                  />

                  <TextField
                    id="banner1Text"
                    label="Alert Text"
                    rows="2"
                    value={bannerSettings.banner1Text}
                    onChange={(e) => setBannerSettings(prev => ({ ...prev, banner1Text: e.target.value }))}
                    placeholder="e.g., Your trusted online fireworks store"
                  />
                </ControlGroup>


                <button
                  type="button"
                  onClick={handleSaveBanner}
                  disabled={saving}
                  aria-busy={saving}
                  className="btn-primary w-full"
                >
                  <SaveLabel saving={saving} idle="Save Alerts Settings" />
                </button>
              </div>
            )}

{activeTab === 'heroSlides' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="label-caps">Section</p>
                    <h2 className="subsection-title mt-1">Hero Slides</h2>
                  </div>
                  <button type="button" onClick={addHeroSlide} className="btn-outline min-h-[44px]">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add Slide
                  </button>
                </div>

                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Slides auto-scroll in the hero banner. Each slide carries an image, heading,
                  subheading and CTA button. Reorder with the arrows; unticked slides are hidden.
                  The legacy single hero still renders while no slides are enabled.
                </p>

                {heroSlides.length === 0 && (
                  <PanelEmpty
                    icon={Images}
                    title="No slides yet"
                    description="Add your first hero banner slide. It will appear on the homepage immediately after saving."
                  />
                )}

                <div className="space-y-4">
                  {heroSlides.map((slide, index) => (
                    <div
                      key={slide.id}
                      className="p-4"
                      style={{
                        background: 'var(--surface-sunken)',
                        border: '1px solid var(--hairline)',
                        borderRadius: 'var(--r-md)',
                        opacity: slide.enabled === false ? 0.6 : 1
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex shrink-0 flex-col">
                          <button
                            type="button"
                            onClick={() => moveItem(heroSlides, setHeroSlides, index, -1)}
                            disabled={index === 0}
                            aria-label={`Move slide ${index + 1} up`}
                            className="flex h-6 w-6 items-center justify-center rounded disabled:opacity-30"
                            style={{ color: 'var(--ember-600)' }}
                          >
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveItem(heroSlides, setHeroSlides, index, 1)}
                            disabled={index === heroSlides.length - 1}
                            aria-label={`Move slide ${index + 1} down`}
                            className="flex h-6 w-6 items-center justify-center rounded disabled:opacity-30"
                            style={{ color: 'var(--ember-600)' }}
                          >
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>

                        <span
                          className="tabular grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-sm)] text-xs font-bold"
                          style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline-strong)', color: 'var(--text-strong)' }}
                        >
                          {index + 1}
                        </span>

                        <p className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                          {slide.heading || slide.eyebrow || `Slide ${index + 1}`}
                        </p>

                        <input
                          type="checkbox"
                          checked={slide.enabled !== false}
                          onChange={() => toggleItem(heroSlides, setHeroSlides, index)}
                          aria-label={`Show slide ${index + 1}`}
                          className="h-5 w-5 shrink-0 cursor-pointer"
                          style={{ accentColor: 'var(--ember-600)' }}
                        />

                        <button
                          type="button"
                          onClick={() => removeHeroSlide(index)}
                          aria-label={`Delete slide ${index + 1}`}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded"
                          style={{ color: 'var(--crimson-600)' }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="mt-4 space-y-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div className="space-y-3">
                            <UploadField id={`slideImg-${index}`} onChange={(e) => handleSlideImageUpload(index, e)} dense>
                              Upload Banner Image
                            </UploadField>
                            <input
                              aria-label={`Slide ${index + 1} image URL`}
                              type="text"
                              value={slide.imageUrl || ''}
                              onChange={(e) => updateHeroSlide(index, { imageUrl: e.target.value })}
                              className="input-premium block w-full text-sm"
                              placeholder="Or enter image URL..."
                            />
                          </div>
                          <div className="space-y-3">
                            <label htmlFor={`slideEyebrow-${index}`} className="label-caps block">Eyebrow Badge</label>
                            <input
                              id={`slideEyebrow-${index}`}
                              type="text"
                              value={slide.eyebrow || ''}
                              onChange={(e) => updateHeroSlide(index, { eyebrow: e.target.value })}
                              className="input-premium block w-full text-sm"
                              placeholder="Festival Offer"
                            />
                          </div>
                        </div>

                        <TextField
                          id={`slideHeading-${index}`}
                          label="Heading"
                          type="text"
                          value={slide.heading || ''}
                          onChange={(e) => updateHeroSlide(index, { heading: e.target.value })}
                          placeholder="Festival Sale Live"
                        />

                        <TextField
                          id={`slideSubHeading-${index}`}
                          label="Subheading"
                          rows="2"
                          value={slide.subHeading || ''}
                          onChange={(e) => updateHeroSlide(index, { subHeading: e.target.value })}
                          placeholder="Big savings on premium crackers across every category"
                        />

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <TextField
                            id={`slideCtaText-${index}`}
                            label="CTA Button Text"
                            type="text"
                            value={slide.ctaText || ''}
                            onChange={(e) => updateHeroSlide(index, { ctaText: e.target.value })}
                            placeholder="Shop Crackers"
                          />
                          <TextField
                            id={`slideCtaLink-${index}`}
                            label="CTA Link"
                            type="text"
                            value={slide.ctaLink || ''}
                            onChange={(e) => updateHeroSlide(index, { ctaLink: e.target.value })}
                            placeholder="/products or /products?category=Rockets"
                            hint="Internal path or full URL"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleSaveHeroSlides}
                  disabled={saving}
                  aria-busy={saving}
                  className="btn-primary w-full"
                >
                  <SaveLabel saving={saving} idle="Save Hero Slides" />
                </button>
              </div>
            )}

            {activeTab === 'deals' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="label-caps">Section</p>
                    <h2 className="subsection-title mt-1">Festive Deals</h2>
                  </div>
                  <button type="button" onClick={addDeal} className="btn-outline min-h-[44px]">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add Deal
                  </button>
                </div>

                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Premium offer cards shown in the Festive Deals section. Each card carries a
                  title, description, offer tag, icon, colours and a CTA link.
                </p>

                {festiveDeals.length === 0 && (
                  <PanelEmpty
                    icon={BadgePercent}
                    title="No deals yet"
                    description="Add your first festive deal card — it appears on the homepage right after saving."
                  />
                )}

                <div className="space-y-4">
                  {festiveDeals.map((deal, index) => (
                    <div
                      key={deal.id}
                      className="p-4"
                      style={{
                        background: 'var(--surface-sunken)',
                        border: '1px solid var(--hairline)',
                        borderRadius: 'var(--r-md)',
                        opacity: deal.enabled === false ? 0.6 : 1
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex shrink-0 flex-col">
                          <button
                            type="button"
                            onClick={() => moveItem(festiveDeals, setFestiveDeals, index, -1)}
                            disabled={index === 0}
                            aria-label={`Move deal ${index + 1} up`}
                            className="flex h-6 w-6 items-center justify-center rounded disabled:opacity-30"
                            style={{ color: 'var(--ember-600)' }}
                          >
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveItem(festiveDeals, setFestiveDeals, index, 1)}
                            disabled={index === festiveDeals.length - 1}
                            aria-label={`Move deal ${index + 1} down`}
                            className="flex h-6 w-6 items-center justify-center rounded disabled:opacity-30"
                            style={{ color: 'var(--ember-600)' }}
                          >
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>

                        <span
                          className="tabular grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-sm)] text-xs font-bold"
                          style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline-strong)', color: 'var(--text-strong)' }}
                        >
                          {index + 1}
                        </span>

                        <p className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                          {deal.title || deal.offerText || `Deal ${index + 1}`}
                        </p>

                        <input
                          type="checkbox"
                          checked={deal.enabled !== false}
                          onChange={() => toggleItem(festiveDeals, setFestiveDeals, index)}
                          aria-label={`Show deal ${index + 1}`}
                          className="h-5 w-5 shrink-0 cursor-pointer"
                          style={{ accentColor: 'var(--ember-600)' }}
                        />

                        <button
                          type="button"
                          onClick={() => removeDeal(index)}
                          aria-label={`Delete deal ${index + 1}`}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded"
                          style={{ color: 'var(--crimson-600)' }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="mt-4 space-y-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <TextField
                            id={`dealTitle-${index}`}
                            label="Title"
                            type="text"
                            value={deal.title || ''}
                            onChange={(e) => updateDeal(index, { title: e.target.value })}
                            placeholder="Free Delivery"
                          />
                          <TextField
                            id={`dealOffer-${index}`}
                            label="Offer Tag"
                            type="text"
                            value={deal.offerText || ''}
                            onChange={(e) => updateDeal(index, { offerText: e.target.value })}
                            placeholder="20% OFF"
                          />
                        </div>

                        <TextField
                          id={`dealDescription-${index}`}
                          label="Description"
                          rows="2"
                          value={deal.description || ''}
                          onChange={(e) => updateDeal(index, { description: e.target.value })}
                          placeholder="On orders above Rs. 2,000 across Hyderabad"
                        />

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <label htmlFor={`dealIcon-${index}`} className="label-caps block">Icon</label>
                            <select
                              id={`dealIcon-${index}`}
                              value={deal.icon || 'Gift'}
                              onChange={(e) => updateDeal(index, { icon: e.target.value })}
                              className="input-premium mt-2 block w-full"
                            >
                              {Object.keys(DEAL_ICON_OPTIONS).map(name => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label htmlFor={`dealFrom-${index}`} className="label-caps block">Gradient From</label>
                              <input
                                id={`dealFrom-${index}`}
                                type="color"
                                value={deal.gradientFrom || '#C33A14'}
                                onChange={(e) => updateDeal(index, { gradientFrom: e.target.value })}
                                className="mt-2 h-11 w-full cursor-pointer"
                                style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)' }}
                              />
                            </div>
                            <div>
                              <label htmlFor={`dealTo-${index}`} className="label-caps block">Gradient To</label>
                              <input
                                id={`dealTo-${index}`}
                                type="color"
                                value={deal.gradientTo || '#DF4C21'}
                                onChange={(e) => updateDeal(index, { gradientTo: e.target.value })}
                                className="mt-2 h-11 w-full cursor-pointer"
                                style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)' }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <TextField
                            id={`dealCtaText-${index}`}
                            label="CTA Button Text"
                            type="text"
                            value={deal.ctaText || ''}
                            onChange={(e) => updateDeal(index, { ctaText: e.target.value })}
                            placeholder="Shop Now"
                          />
                          <TextField
                            id={`dealCtaLink-${index}`}
                            label="CTA Link"
                            type="text"
                            value={deal.ctaLink || ''}
                            onChange={(e) => updateDeal(index, { ctaLink: e.target.value })}
                            placeholder="/products or /products?category=Gift Boxes"
                            hint="Internal path or full URL"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleSaveDeals}
                  disabled={saving}
                  aria-busy={saving}
                  className="btn-primary w-full"
                >
                  <SaveLabel saving={saving} idle="Save Festive Deals" />
                </button>
              </div>
            )}

            {activeTab === 'categories' && (
              <div className="space-y-6">
                <div>
                  <p className="label-caps">Section</p>
                  <h2 className="subsection-title mt-1">Category Showcase</h2>
                </div>

                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Reorder the category cards on the homepage and hide any you do not want shown.
                  Unticked categories are hidden from customers but remain in the catalogue.
                </p>

                <div className="space-y-2">
                  {categoryConfig.order.map((slug, index) => {
                    const def = categoryDefs.find(c => c.slug === slug);
                    if (!def) return null;
                    const hidden = categoryConfig.hidden.includes(slug);
                    return (
                      <div
                        key={slug}
                        className="flex items-center gap-2 p-3"
                        style={{
                          background: 'var(--surface-sunken)',
                          border: '1px solid var(--hairline)',
                          borderRadius: 'var(--r-md)',
                          opacity: hidden ? 0.55 : 1
                        }}
                      >
                        <div className="flex shrink-0 flex-col">
                          <button
                            type="button"
                            onClick={() => moveCategory(index, -1)}
                            disabled={index === 0}
                            aria-label={`Move ${def.name} up`}
                            className="flex h-6 w-6 items-center justify-center rounded disabled:opacity-30"
                            style={{ color: 'var(--ember-600)' }}
                          >
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveCategory(index, 1)}
                            disabled={index === categoryConfig.order.length - 1}
                            aria-label={`Move ${def.name} down`}
                            className="flex h-6 w-6 items-center justify-center rounded disabled:opacity-30"
                            style={{ color: 'var(--ember-600)' }}
                          >
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>

                        <span
                          className="tabular grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] text-xs font-bold"
                          style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline-strong)', color: 'var(--text-strong)' }}
                        >
                          {index + 1}
                        </span>

                        <p className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                          {def.name}
                        </p>

                        <input
                          type="checkbox"
                          checked={!hidden}
                          onChange={(e) => toggleCategory(slug, !e.target.checked)}
                          aria-label={`Show ${def.name}`}
                          className="h-5 w-5 shrink-0 cursor-pointer"
                          style={{ accentColor: 'var(--ember-600)' }}
                        />
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-subtle)' }}>
                  Categories added in future stay visible at the end until you reorder them here.
                </p>

                <button
                  type="button"
                  onClick={handleSaveCategories}
                  disabled={saving}
                  aria-busy={saving}
                  className="btn-primary w-full"
                >
                  <SaveLabel saving={saving} idle="Save Category Showcase" />
                </button>
              </div>
            )}

            {activeTab === 'content' && (
              <div className="space-y-6">
                <div>
                  <p className="label-caps">Section</p>
                  <h2 className="subsection-title mt-1">Section Text</h2>
                </div>

                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Edit the headings and descriptions shown above each homepage section.
                </p>

                {[
                  ['categories', 'Shop by Categories'],
                  ['deals', 'Festive Deals'],
                  ['featured', 'Featured Products'],
                  ['bestSellers', 'Best Sellers'],
                  ['trust', 'Why Choose Us']
                ].map(([group, label]) => (
                  <ControlGroup key={group} icon={Type} title={label}>
                    <TextField
                      id={`contentEyebrow-${group}`}
                      label="Eyebrow"
                      type="text"
                      value={homepageContent[group].eyebrow}
                      onChange={(e) => updateContent(group, 'eyebrow', e.target.value)}
                    />
                    <TextField
                      id={`contentTitle-${group}`}
                      label="Title"
                      type="text"
                      value={homepageContent[group].title}
                      onChange={(e) => updateContent(group, 'title', e.target.value)}
                    />
                    <TextField
                      id={`contentSubtitle-${group}`}
                      label="Subtitle"
                      rows="2"
                      value={homepageContent[group].subtitle}
                      onChange={(e) => updateContent(group, 'subtitle', e.target.value)}
                    />
                  </ControlGroup>
                ))}

                <button
                  type="button"
                  onClick={handleSaveContent}
                  disabled={saving}
                  aria-busy={saving}
                  className="btn-primary w-full"
                >
                  <SaveLabel saving={saving} idle="Save Section Text" />
                </button>
              </div>
            )}

            {activeTab === 'footer' && (
              <div className="space-y-6">
                <div>
                  <p className="label-caps">Section</p>
                  <h2 className="subsection-title mt-1">Footer Settings</h2>
                </div>

                <ControlGroup
                  icon={Type}
                  title="Identity"
                  description="Shop name and tagline shown at the top of the footer."
                >
                  <TextField
                    id="footerShopName"
                    label="Shop Name"
                    type="text"
                    value={footerSettings.shopName}
                    onChange={(e) => setFooterSettings(prev => ({ ...prev, shopName: e.target.value }))}
                  />

                  <TextField
                    id="footerTagline"
                    label="Tagline"
                    type="text"
                    value={footerSettings.tagline}
                    onChange={(e) => setFooterSettings(prev => ({ ...prev, tagline: e.target.value }))}
                  />
                </ControlGroup>

                <ControlGroup
                  icon={MessageSquare}
                  title="Contact Details"
                  description="Address and contact routes published in the footer."
                >
                  <TextField
                    id="footerAddress"
                    label="Address"
                    type="text"
                    value={footerSettings.address}
                    onChange={(e) => setFooterSettings(prev => ({ ...prev, address: e.target.value }))}
                  />

                  <TextField
                    id="footerPhone"
                    label="Phone"
                    type="tel"
                    value={footerSettings.phone}
                    onChange={(e) => setFooterSettings(prev => ({ ...prev, phone: e.target.value }))}
                  />

                  <TextField
                    id="footerEmail"
                    label="Email"
                    type="email"
                    value={footerSettings.email}
                    onChange={(e) => setFooterSettings(prev => ({ ...prev, email: e.target.value }))}
                  />

                  <ToggleRow
                    id="showSocialLinks"
                    label="Show Social Media Links"
                    checked={footerSettings.showSocialLinks}
                    onChange={(e) => setFooterSettings(prev => ({ ...prev, showSocialLinks: e.target.checked }))}
                  />
                </ControlGroup>

                <button
                  type="button"
                  onClick={handleSaveFooter}
                  disabled={saving}
                  aria-busy={saving}
                  className="btn-primary w-full"
                >
                  <SaveLabel saving={saving} idle="Save Footer Settings" />
                </button>
              </div>
            )}

            {activeTab === 'admin' && (
              <div className="space-y-6">
                <div>
                  <p className="label-caps">Section</p>
                  <h2 className="subsection-title mt-1">Admin Settings</h2>
                </div>

                <ControlGroup
                  icon={MessageSquare}
                  title="WhatsApp Integration"
                  description="Configure WhatsApp for customer support and invoice sharing"
                >
                  <ToggleRow
                    id="whatsappEnabled"
                    label="Enable WhatsApp Support"
                    checked={adminSettings.whatsappEnabled}
                    onChange={(e) => setAdminSettings(prev => ({ ...prev, whatsappEnabled: e.target.checked }))}
                  />

                  <TextField
                    id="whatsappNumber"
                    label="WhatsApp Number"
                    type="tel"
                    value={adminSettings.whatsappNumber}
                    onChange={(e) => setAdminSettings(prev => ({ ...prev, whatsappNumber: e.target.value }))}
                    placeholder="+91 1234567890"
                    hint="This number will be used for customer WhatsApp support and invoice sharing"
                  />
                </ControlGroup>

                <ControlGroup
                  icon={IndianRupee}
                  title="Minimum Order Value"
                  description="Set minimum order value for online checkout"
                >
                  <ToggleRow
                    id="minimumOrderValueEnabled"
                    label="Enable Minimum Order Value Validation"
                    checked={adminSettings.minimumOrderValueEnabled}
                    onChange={(e) => setAdminSettings(prev => ({ ...prev, minimumOrderValueEnabled: e.target.checked }))}
                  />

                  <TextField
                    id="minimumOrderValue"
                    label="Minimum Order Value (₹)"
                    type="number"
                    className="tabular"
                    value={adminSettings.minimumOrderValue}
                    onChange={(e) => setAdminSettings(prev => ({ ...prev, minimumOrderValue: parseFloat(e.target.value) || 0 }))}
                    placeholder="500"
                    min="0"
                    step="50"
                    hint="Customers must have at least this amount in cart to checkout online"
                  />
                </ControlGroup>

                <ControlGroup
                  icon={MapPin}
                  title="Delivery Location Pin"
                  description="Let customers pin their exact doorstep on a map at checkout"
                >
                  <ToggleRow
                    id="deliveryPinEnabled"
                    label="Enable Map Pin at Checkout"
                    hint="Shows a map above the address fields. Pinned orders print a navigation QR code on the admin invoice."
                    checked={adminSettings.deliveryPinEnabled !== false}
                    onChange={(e) => setAdminSettings(prev => ({ ...prev, deliveryPinEnabled: e.target.checked }))}
                  />

                  <div
                    className="p-3"
                    style={{
                      background: 'var(--surface-card)',
                      border: '1px solid var(--hairline)',
                      borderRadius: 'var(--r-md)'
                    }}
                  >
                    <p className="label-caps">Address Lookup Provider</p>
                    <p className="mt-1.5 text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                      {geocodeConfig
                        ? geocodeConfig.googleConfigured
                          ? 'Google Geocoding'
                          : 'OpenStreetMap (Nominatim)'
                        : 'Checking…'}
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-subtle)' }}>
                      No key is needed — OpenStreetMap is free and works out of the box. For better Indian
                      street-level coverage, set <span className="tabular">GOOGLE_GEOCODING_API_KEY</span> in the
                      server environment and restart the API. The key is deliberately not stored here: this
                      settings document is readable by every storefront visitor, so a key saved into it would be
                      public.
                    </p>
                  </div>
                </ControlGroup>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleSaveAdmin}
                    disabled={saving}
                    aria-busy={saving}
                    className="btn-primary w-full"
                  >
                    <SaveLabel saving={saving} idle="Save Admin Settings" />
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveAll}
                    disabled={saving}
                    aria-busy={saving}
                    className="btn-outline w-full"
                  >
                    <SaveLabel saving={saving} idle="Save Changes" />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'sections' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="label-caps">Section</p>
                    <h2 className="subsection-title mt-1">Homepage Sections</h2>
                  </div>
                  <span className="badge badge-gold">
                    {sectionStatus === 'published' ? 'Published' : 'Draft'}
                  </span>
                </div>

                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Reorder and toggle the sections of the public homepage. Save keeps a draft;
                  the storefront only changes once you Publish. Wholesale and Footer are
                  always kept last, and the Hero cannot move.
                </p>

                <div className="space-y-2">
                  {sectionItems.map((section, index) => {
                    const meta = SECTION_META[section.id];
                    const locked = section.id === 'hero' || section.id === 'wholesale' || section.id === 'footer';
                    return (
                      <div
                        key={section.id}
                        className="flex items-center gap-2 p-3"
                        style={{
                          background: 'var(--surface-sunken)',
                          border: '1px solid var(--hairline)',
                          borderRadius: 'var(--r-md)',
                          opacity: section.enabled ? 1 : 0.55,
                        }}
                      >
                        <div className="flex shrink-0 flex-col">
                          <button
                            type="button"
                            onClick={() => moveSection(index, -1)}
                            disabled={index === 0 || locked}
                            aria-label={`Move ${meta.label} up`}
                            className="flex h-7 w-7 items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-30"
                            style={{ color: 'var(--ember-600)' }}
                          >
                            <ArrowUp className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSection(index, 1)}
                            disabled={index === sectionItems.length - 1 || locked}
                            aria-label={`Move ${meta.label} down`}
                            className="flex h-7 w-7 items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-30"
                            style={{ color: 'var(--ember-600)' }}
                          >
                            <ArrowDown className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                          </button>
                        </div>

                        <span
                          aria-hidden="true"
                          className="tabular grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] text-xs font-bold"
                          style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline-strong)', color: 'var(--text-strong)' }}
                        >
                          {index + 1}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                            {meta.label}
                            {locked && <span className="label-caps ml-2" style={{ color: 'var(--text-subtle)' }}>Fixed</span>}
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                            {meta.description}
                          </p>
                        </div>

                        <input
                          type="checkbox"
                          checked={section.enabled}
                          onChange={(e) => toggleSection(section.id, e.target.checked)}
                          disabled={section.id === 'hero' || section.id === 'footer'}
                          aria-label={`Show ${meta.label}`}
                          className="h-5 w-5 shrink-0 cursor-pointer"
                          style={{ accentColor: 'var(--ember-600)' }}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => handleSaveSections('draft')}
                    disabled={saving}
                    aria-busy={saving}
                    className="btn-outline w-full"
                  >
                    <SaveLabel saving={saving} idle="Save Draft" />
                  </button>

                  <button
                    type="button"
                    onClick={handlePublishSections}
                    disabled={publishing}
                    aria-busy={publishing}
                    className="btn-primary w-full"
                  >
                    {publishing ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Send className="h-4 w-4" aria-hidden="true" />
                    )}
                    {publishing ? 'Publishing...' : 'Publish to Storefront'}
                  </button>
                </div>
              </div>
            )}
          </motion.div>

          {/* Live Preview Panel */}
          <motion.div
            variants={revealVariants(reduced, 18)}
            initial="hidden"
            animate="visible"
            className="min-w-0"
          >
            <div className="panel-editorial p-5 sm:p-7 lg:sticky lg:top-24">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--hairline)' }}>
                <div className="flex items-center gap-2">
                  <Eye className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
                  <h3 className="card-title" style={{ color: 'var(--text-strong)' }}>Live Preview</h3>
                </div>
                <span className="badge badge-gold">{activeTabLabel}</span>
              </div>

              <div className="mt-5">
                {activeTab === 'hero' && (
                  <div
                    className="relative overflow-hidden"
                    style={{ height: '400px', borderRadius: 'var(--r-lg)', border: '1px solid var(--hairline)' }}
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        background: `linear-gradient(rgba(0,0,0,${heroSettings.backgroundOverlay - 0.05}), rgba(0,0,0,${heroSettings.backgroundOverlay + 0.05})), url(${heroSettings.backgroundImage})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        filter: `brightness(${heroSettings.brightness}%)`,
                        animation: heroSettings.liveMotion ? 'slowZoom 20s ease-in-out infinite alternate' : 'none'
                      }}
                    ></div>
                    <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3 p-4 text-white">
                      <img
                        src={heroSettings.logoImage || '/images/website/standard-logo.png'}
                        alt="Logo"
                        style={{
                          maxWidth: `${heroSettings.logoSize}vw`,
                          filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.7))'
                        }}
                      />
                      <h1 style={{
                        color: '#BE8C36',
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        textShadow: '0 0 40px rgba(0,0,0,0.8)'
                      }}>
                        {heroSettings.mainHeading}
                      </h1>
                      <h2 style={{
                        color: '#BE8C36',
                        fontSize: '1rem',
                        fontWeight: 600,
                        textShadow: '0 0 30px rgba(0,0,0,0.8)'
                      }}>
                        {heroSettings.subHeading}
                      </h2>
                      <p style={{
                        fontSize: '0.85rem',
                        textAlign: 'center',
                        maxWidth: '90%',
                        textShadow: '0 0 30px rgba(0,0,0,0.9)'
                      }}>
                        {heroSettings.subtitle}
                      </p>
                      <button type="button" style={{
                        background: 'linear-gradient(90deg, #BE8C36, #D2A64F)',
                        color: 'var(--maroon)',
                        padding: '12px 32px',
                        borderRadius: '14px',
                        fontWeight: 700,
                        border: 'none'
                      }}>
                        {heroSettings.ctaText}
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'banner' && (
                  <div className="space-y-5">
                    {/* Top Alert Preview — mini seamless marquee */}
                    {bannerSettings.topBannerEnabled && (
                      <div>
                        <p className="label-caps">Top Alert</p>
                        <div className="mt-2 overflow-hidden rounded-lg" style={{ background: 'linear-gradient(96deg, var(--maroon-900) 0%, var(--maroon-700) 36%, var(--maroon-600) 64%, var(--ember-600) 100%)' }}>
                          <div className="marquee-viewport flex min-h-8 items-center">
                            <div className="marquee-track flex w-max items-center" style={{ animationDuration: '18s' }}>
                              {[...(() => {
                                const msgs = (bannerSettings.topBannerMessages || []).length > 0
                                  ? bannerSettings.topBannerMessages
                                  : [bannerSettings.topBannerText].filter(Boolean);
                                return [...msgs, ...msgs, ...msgs, ...msgs];
                              })()].map((msg, i) => (
                                <span key={i} className="flex shrink-0 items-center gap-2 whitespace-nowrap px-4 text-xs font-semibold" style={{ color: '#fff' }}>
                                  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ background: 'rgba(210,166,79,0.18)', border: '1px solid rgba(210,166,79,0.45)' }}>
                                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--gold-400)' }} />
                                  </span>
                                  {msg}
                                  <span aria-hidden="true" className="ml-2 h-0.5 w-0.5 shrink-0 rotate-45" style={{ background: 'var(--gold-400)', opacity: 0.85 }} />
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Alert 1 Preview (Static) */}
                    {bannerSettings.banner1Enabled && (
                      <div>
                        <p className="label-caps">Alert 1 (Static)</p>
                        <div className="mt-2 rounded-lg bg-gradient-to-r from-primary-600 via-accent-600 to-primary-600 px-4 py-2 text-center text-white">
                          <p className="text-xs font-semibold">{bannerSettings.banner1Text}</p>
                        </div>
                      </div>
                    )}

                    {!anyAlertEnabled && (
                      <PanelEmpty
                        icon={Megaphone}
                        title="No alerts enabled"
                        description="Turn on an alert in the panel on the left and its preview will appear here."
                      />
                    )}
                  </div>
                )}

            {activeTab === 'heroSlides' && (
              <div className="space-y-3">
                {heroSlides.length === 0 ? (
                  <PanelEmpty
                    icon={Images}
                    title="Legacy hero active"
                    description="No slides are enabled, so the homepage shows the classic single hero. Add slides to switch to the banner carousel."
                  />
                ) : (
                  heroSlides.map((slide, index) => (
                    <div
                      key={slide.id}
                      className="overflow-hidden"
                      style={{
                        borderRadius: 'var(--r-md)',
                        border: '1px solid var(--hairline)',
                        opacity: slide.enabled === false ? 0.55 : 1
                      }}
                    >
                      <div className="relative h-28 w-full" style={{ background: 'var(--maroon-900)' }}>
                        {slide.imageUrl ? (
                          <img src={slide.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[0.65rem] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--gold-400)' }}>
                            {slide.eyebrow || 'Banner Image'}
                          </div>
                        )}
                        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(10,7,7,0.35), rgba(10,7,7,0.75))' }} />
                        <div className="absolute inset-x-0 bottom-0 p-2.5">
                          <p className="truncate text-xs font-bold" style={{ color: '#FFFFFF' }}>{slide.heading || '(No heading)'}</p>
                          <p className="truncate text-[0.65rem]" style={{ color: 'rgba(237,231,223,0.8)' }}>
                            {slide.ctaText || 'Shop Crackers'} → {slide.ctaLink || '/products'}
                          </p>
                        </div>
                      </div>
                      <p className="px-2.5 py-1.5 text-[0.65rem] font-semibold" style={{ color: 'var(--text-muted)' }}>
                        Slide {index + 1} · {slide.enabled === false ? 'Hidden' : 'Visible'}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'deals' && (
              <div>
                {festiveDeals.length === 0 ? (
                  <PanelEmpty
                    icon={BadgePercent}
                    title="No deals configured"
                    description="Add festive deals on the left; the section stays hidden on the homepage until then."
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {festiveDeals.map((deal, index) => {
                      const Icon = DEAL_ICON_OPTIONS[deal.icon] || DEAL_ICON_OPTIONS.Gift;
                      const gradient = deal.gradientFrom && deal.gradientTo
                        ? `linear-gradient(128deg, ${deal.gradientFrom}, ${deal.gradientTo})`
                        : ['linear-gradient(128deg,#7A2410,#9E2C10)', 'linear-gradient(128deg,#C33A14,#DF4C21)', 'linear-gradient(128deg,#7C5622,#BE8C36)', 'linear-gradient(128deg,#5C1A24,#8F2433)'][index % 4];
                      return (
                        <div
                          key={deal.id}
                          className="overflow-hidden p-3"
                          style={{
                            borderRadius: 'var(--r-md)',
                            background: gradient,
                            border: '1px solid rgba(210,166,79,0.35)',
                            opacity: deal.enabled === false ? 0.55 : 1
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="rounded-full px-2 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider" style={{ background: 'rgba(210,166,79,0.22)', color: 'var(--gold-200)' }}>
                              {deal.offerText || 'Offer'}
                            </span>
                            <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: '#FFFFFF' }} />
                          </div>
                          <p className="mt-2 truncate text-xs font-bold" style={{ color: '#FFFFFF' }}>{deal.title || '(No title)'}</p>
                          <p className="mt-0.5 line-clamp-2 text-[0.6rem] leading-relaxed" style={{ color: 'rgba(237,231,223,0.85)' }}>
                            {deal.description || ''}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'categories' && (
              <div>
                {categoryConfig.order.length === 0 ? (
                  <PanelEmpty
                    icon={LayoutGrid}
                    title="Default order"
                    description="No saved order yet — all nine categories show in the default sequence. Save once to manage them here."
                  />
                ) : (
                  <ol className="space-y-1.5">
                    {categoryConfig.order.map((slug, index) => {
                      const def = categoryDefs.find(c => c.slug === slug);
                      if (!def) return null;
                      const hidden = categoryConfig.hidden.includes(slug);
                      return (
                        <li
                          key={slug}
                          className="flex items-center gap-2 rounded-[var(--r-sm)] px-2.5 py-1.5 text-xs"
                          style={{
                            background: hidden ? 'transparent' : 'var(--surface-sunken)',
                            border: hidden ? '1px dashed var(--hairline-strong)' : '1px solid var(--hairline)',
                            color: hidden ? 'var(--text-subtle)' : 'var(--text-body)',
                            textDecoration: hidden ? 'line-through' : 'none'
                          }}
                        >
                          <span className="tabular shrink-0 font-bold" style={{ color: 'var(--ember-600)' }}>{index + 1}</span>
                          <span className="truncate">{def.name}</span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            )}

            {activeTab === 'content' && (
              <div className="space-y-3">
                {[
                  ['categories', 'Shop by Categories'],
                  ['deals', 'Festive Deals'],
                  ['featured', 'Featured Products'],
                  ['bestSellers', 'Best Sellers'],
                  ['trust', 'Why Choose Us']
                ].map(([group, label]) => (
                  <div key={group} className="p-3.5" style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--r-md)', border: '1px solid var(--hairline)' }}>
                    <p className="label-caps">{label}</p>
                    <p className="mt-1 text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
                      {homepageContent[group].title}
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {homepageContent[group].eyebrow} · {homepageContent[group].subtitle}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'footer' && (
                  <div
                    className="p-6 text-white"
                    style={{ background: 'var(--grad-maroon)', borderRadius: 'var(--r-lg)' }}
                  >
                    <h3 className="text-2xl font-bold" style={{ color: '#FFFFFF' }}>{footerSettings.shopName}</h3>
                    <p className="mt-2" style={{ color: 'rgba(255,255,255,0.78)' }}>{footerSettings.tagline}</p>
                    <hr className="rule-gold my-4" />
                    <div className="space-y-2 text-sm" style={{ color: 'rgba(255,255,255,0.9)' }}>
                      <p>{footerSettings.address}</p>
                      <p className="tabular">{footerSettings.phone}</p>
                      <p className="break-words">{footerSettings.email}</p>
                    </div>
                    {footerSettings.showSocialLinks && (
                      <div className="mt-4 text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>
                        Social media links enabled
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'admin' && (
                  <PanelEmpty
                    icon={MonitorSmartphone}
                    title="No visual preview"
                    description="Admin settings change checkout and support behaviour rather than the storefront layout, so there is nothing to render here. Save to apply them."
                  />
                )}

                {activeTab === 'sections' && (
                  <div
                    className="p-4"
                    style={{ background: 'var(--surface-page)', borderRadius: 'var(--r-lg)', border: '1px solid var(--hairline)' }}
                  >
                    <p className="label-caps mb-3">Homepage structure</p>
                    <ol className="space-y-1.5">
                      {sectionItems.map((section, index) => {
                        const meta = SECTION_META[section.id];
                        return (
                          <li
                            key={section.id}
                            className="flex items-center gap-2 rounded-[var(--r-sm)] px-2.5 py-1.5 text-xs"
                            style={{
                              background: section.enabled ? 'var(--surface-sunken)' : 'transparent',
                              border: section.enabled ? '1px solid var(--hairline)' : '1px dashed var(--hairline-strong)',
                              color: section.enabled ? 'var(--text-body)' : 'var(--text-subtle)',
                              textDecoration: section.enabled ? 'none' : 'line-through',
                            }}
                          >
                            <span className="tabular shrink-0 font-bold" style={{ color: 'var(--ember-600)' }}>
                              {index + 1}
                            </span>
                            <span className="truncate">{meta.label}</span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default CanvasEditor;
