/* The approved store categories, each mapped to its single PNG icon.
   These names are used across the site (Home, Products filters, footer,
   product pages, price list). */

const NAME_SLUGS = {
  Rockets: 'rockets',
  Sparkles: 'sparkles',
  'Ground Chakkars': 'ground-chakkars',
  'Fancy Fireworks': 'fancy',
  'Gift Boxes': 'gift-boxes',
  'Flower Pots': 'flower-pots',
  Bombs: 'bombs',
  Garlands: 'garlands',
  'Kids Special': 'kids',
  'Guns, Rolls & Pop Pop': 'guns-rolls-pop-pop',
  'Threads and Novelties': 'threads-novelties',
};

export const slugForCategory = (name) =>
  NAME_SLUGS[String(name || '').trim()] || 'rockets';