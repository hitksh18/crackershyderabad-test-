/**
 * Static content for the homepage.
 *
 * Nothing here is derived from Firestore — these are the fixed editorial
 * definitions the page has always carried. Category matching rules, promo
 * banner links and trust copy are unchanged; only their presentation moved.
 */

import {
  BadgeCheck,
  Truck,
  IndianRupee,
  Zap,
  Flame,
  Gift,
  ShieldCheck,
  CreditCard,
  Headphones,
  Star,
  Boxes,
  Store,
  Tags,
  LayoutGrid,
  PackageSearch,
  CalendarDays,
} from 'lucide-react';

export const categoryDefs = [
  { name: 'Sparkles', slug: 'sparkles', match: ['Sparkles'], link: 'Sparkles' },
  { name: 'Ground Chakkars', slug: 'ground-chakkars', match: ['Ground Chakkars'], link: 'Ground Chakkars' },
  { name: 'Flower Pots', slug: 'flower-pots', match: ['Flower Pots'], link: 'Flower Pots' },
  { name: 'Bombs', slug: 'bombs', match: ['Bombs'], link: 'Bombs' },
  { name: 'Garlands', slug: 'garlands', match: ['Garlands'], link: 'Garlands' },
  { name: 'Rockets', slug: 'rockets', match: ['Rockets'], link: 'Rockets' },
  { name: 'Fancy Fireworks', slug: 'fancy', match: ['Fancy Fireworks'], link: 'Fancy Fireworks' },
  { name: 'Guns, Rolls & Pop Pop', slug: 'guns-rolls-pop-pop', match: ['Guns, Rolls & Pop Pop'], link: 'Guns, Rolls & Pop Pop' },
  { name: 'Threads & Pencils', slug: 'threads-novelties', match: ['Threads and Novelties', 'Threads & Pencils'], link: 'Threads and Novelties' },
  { name: 'Kids Special', slug: 'kids', match: ['Kids Special'], link: 'Kids Special' },
  { name: 'Gift Boxes', slug: 'gift-boxes', match: ['Gift Boxes'], link: 'Gift Boxes' },
];

export const promoBanners = [
  { title: '20% OFF', subtitle: 'On selected premium gift boxes', tag: 'FLAT DEAL', icon: BadgeCheck, gradient: 'linear-gradient(120deg, #CB2A2A 0%, #94251F 100%)', link: '/products?category=Gift Boxes' },
  { title: 'Free Delivery', subtitle: 'On orders above Rs. 2,000', tag: 'HYDERABAD WIDE', icon: Truck, gradient: 'linear-gradient(120deg, #C33A14 0%, #DF4C21 100%)', link: '/products' },
  { title: 'Festival Sale', subtitle: 'Big savings on multi-colour packs', tag: 'LIMITED TIME', icon: Flame, gradient: 'linear-gradient(120deg, #7C5622 0%, #BE8C36 100%)', link: '/products' },
  { title: 'Premium Gift Boxes', subtitle: 'Safely packed, ready to gift', tag: 'BEST SELLERS', icon: Gift, gradient: 'linear-gradient(120deg, #7A2410 0%, #9E2C10 100%)', link: '/products?category=Gift Boxes' },
];

export const trustBadges = [
  { text: 'Licensed Products', icon: BadgeCheck },
  { text: 'Safe Delivery', icon: Truck },
  { text: 'Best Prices', icon: IndianRupee },
  { text: 'Fast Shipping', icon: Zap },
];

export const whyChoose = [
  { title: 'Fast Delivery', text: 'Same-day doorstep delivery across Hyderabad', icon: Truck },
  { title: 'Licensed Products', text: 'Safety-tested crackers from certified factories', icon: ShieldCheck },
  { title: 'Secure Payments', text: 'UPI, cards and cash on delivery options', icon: CreditCard },
  { title: 'Customer Support', text: 'Friendly help before, during and after orders', icon: Headphones },
  { title: 'Trusted by Thousands', text: 'Loved by families across the city', icon: Star },
];

/**
 * Wholesale positioning. Themes only — no volumes, no lead times, no
 * certifications and no promises that are not already true elsewhere in the app.
 */
export const wholesalePillars = [
  { title: 'Bulk Ordering', text: 'Build a large order in one cart and set your own quantity line by line.', icon: Boxes },
  { title: 'Festival Stock for Retailers', text: 'Stock a shop counter for the season from a single catalogue.', icon: Store },
  { title: 'Wholesale Pricing', text: 'Wholesale rates across the range, shown before you check out.', icon: Tags },
  { title: 'Range and Variety', text: 'Rockets, sparkles, ground chakkars, flower pots, garlands and gift boxes.', icon: LayoutGrid },
  { title: 'Order Tracking', text: 'Follow an order with its order ID, from packing through to dispatch.', icon: PackageSearch },
  { title: 'Support', text: 'Talk to us before, during and after an order is placed.', icon: Headphones },
  { title: 'Seasonal Supply', text: 'Plan the festival season ahead instead of buying at the last minute.', icon: CalendarDays },
];
