import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const SECTION_META = {
  hero: {
    label: 'Hero Banner',
    description: 'The full-width hero carousel at the top of the homepage.',
    locked: true,
  },
  categories: { label: 'Categories', description: 'Category showcase grid.' },
  featured: { label: 'Featured Products', description: 'Handpicked featured products rail.' },
  bestSellers: { label: 'Best Sellers', description: 'Top-selling products rail from real order data.' },
  deals: { label: 'Festive Deals', description: 'Admin-managed festive offer cards.' },
  promo: { label: 'Promo Banners', description: 'Promotional banner rail.' },
  adminBanner: {
    label: 'Admin Banner',
    description: 'Banner image configured in Homepage Settings.',
  },
  trust: { label: 'Trust Section', description: 'Delivery and payment trust points.' },
  newsletterTrack: {
    label: 'Newsletter & Track Order',
    description: 'Subscription and order-tracking blocks.',
  },
  wholesale: {
    label: 'Wholesale',
    description: 'Wholesale enquiry band — always kept last among selling sections.',
    locked: true,
  },
  footer: { label: 'Footer', description: 'Site footer — always kept last.', locked: true },
};

/* Storefront order: Hero → Categories → Featured → Best Sellers → Festive
   Deals → Trust → Newsletter/Track → Wholesale → Footer. Promo and Admin
   Banner stay available in the Canvas editor but are off by default. */
export const DEFAULT_SECTION_ORDER = [
  'hero',
  'categories',
  'featured',
  'bestSellers',
  'deals',
  'promo',
  'adminBanner',
  'trust',
  'newsletterTrack',
  'wholesale',
  'footer',
];

/* Legacy sections that remain re-orderable and re-enableable from the editor. */
export const DEFAULT_DISABLED_SECTIONS = new Set(['promo', 'adminBanner']);

const defaultSections = () =>
  DEFAULT_SECTION_ORDER.map((id) => ({ id, enabled: !DEFAULT_DISABLED_SECTIONS.has(id) }));

const WHOLESALE = 'wholesale';
const FOOTER = 'footer';

const docRef = () => doc(db, 'settings', 'homepageSections');

const asSections = (order, enabledMap) =>
  order
    .filter((id) => SECTION_META[id])
    .map((id) => ({
      id,
      enabled: id in enabledMap
        ? enabledMap[id] !== false
        : !DEFAULT_DISABLED_SECTIONS.has(id),
    }));

/**
 * Fold any default section missing from a stored order into it at its default
 * position, so newly introduced sections (e.g. Festive Deals) appear without
 * a manual database edit. Existing sections keep their stored order.
 */
export const mergeMissingSections = (order) => {
  const present = new Set(order);
  const merged = [...order];
  DEFAULT_SECTION_ORDER.forEach((id, defaultIndex) => {
    if (present.has(id)) return;
    merged.splice(Math.min(defaultIndex, merged.length), 0, id);
  });
  return merged;
};

/** The storefront enforces the invariants no matter what an editor saved. */
export const enforceSectionOrder = (sections) => {
  const movable = sections.filter((s) => s.id !== WHOLESALE && s.id !== FOOTER);
  const wholesale = sections.find((s) => s.id === WHOLESALE);
  const footer = sections.find((s) => s.id === FOOTER);
  const order = [...movable];
  if (wholesale) order.push(wholesale);
  if (footer) order.push(footer);
  return order;
};

export const readHomepageSections = async () => {
  const fallback = {
    sections: defaultSections(),
    status: 'draft',
  };
  try {
    const snap = await getDoc(docRef());
    if (!snap.exists()) return fallback;
    const data = snap.data();
    const storedOrder = Array.isArray(data.order) ? data.order : DEFAULT_SECTION_ORDER;
    const order = mergeMissingSections(storedOrder);
    const enabled =
      data.enabled && typeof data.enabled === 'object' ? data.enabled : {};
    return {
      sections: enforceSectionOrder(asSections(order, enabled)),
      status: data.status === 'published' ? 'published' : 'draft',
    };
  } catch (error) {
    console.error('Error reading homepage sections:', error);
    return fallback;
  }
};

export const saveHomepageSections = async (sections, status, userEmail) => {
  const ordered = enforceSectionOrder(sections);
  const enabled = Object.fromEntries(ordered.map((s) => [s.id, s.enabled]));
  await setDoc(docRef(), {
    order: ordered.map((s) => s.id),
    enabled,
    status: status === 'published' ? 'published' : 'draft',
    updatedAt: new Date().toISOString(),
    updatedBy: userEmail || 'admin',
  });
  return ordered;
};