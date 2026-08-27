import { Link } from 'react-router-dom';
import ScrollReveal from '../ui/ScrollReveal';
import SectionHeading from '../ui/SectionHeading';
import { promoBanners } from './homeData';

/**
 * Offers. Admin-uploaded promotional banner images ride in a rail above the
 * four fixed promo cards, so a long banner list can never widen the page.
 */
const PromoSection = ({ promotionalBanners }) => (
  <section className="section-pad bg-festive">
    <div className="shell-wide">
      <SectionHeading
        eyebrow="Offers"
        title="Festive Deals"
        subtitle="Limited-time offers you cannot miss"
      />

      {promotionalBanners.length > 0 && (
        <div className="rail mb-10">
          {promotionalBanners.map((banner, index) => (
            <div
              key={banner.id}
              className="w-[86vw] max-w-[420px] overflow-hidden sm:w-[420px]"
              style={{ borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-md)' }}
            >
              <img
                src={banner.imageUrl}
                alt={`Promotional banner ${(banner.order ?? index) + 1}`}
                loading="lazy"
                className="h-auto w-full object-cover"
              />
            </div>
          ))}
        </div>
      )}

      <ScrollReveal stagger={0.06} className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {promoBanners.map((banner) => (
          <ScrollReveal.Item key={banner.title}>
            <Link
              to={banner.link}
              className="group relative flex min-h-[190px] flex-col justify-between overflow-hidden p-5 transition-[transform,box-shadow] duration-300 ease-out-expo hover:-translate-y-1.5"
              style={{
                background: banner.gradient,
                borderRadius: 'var(--r-xl)',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <span
                className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-[var(--r-pill)]"
                style={{ background: 'rgba(255,255,255,0.10)' }}
                aria-hidden="true"
              />
              <span
                className="pointer-events-none absolute -bottom-12 -left-8 h-40 w-40 rounded-[var(--r-pill)]"
                style={{ background: 'rgba(255,255,255,0.10)' }}
                aria-hidden="true"
              />

              <span className="relative flex items-start justify-between gap-3">
                <span
                  className="label-caps rounded-[var(--r-pill)] px-3 py-1"
                  style={{ background: 'rgba(255,255,255,0.2)', color: '#FFFFFF' }}
                >
                  {banner.tag}
                </span>
                <banner.icon
                  className="h-8 w-8 shrink-0 transition-transform duration-300 ease-out-expo group-hover:scale-110"
                  strokeWidth={1.9}
                  style={{ color: 'rgba(255,255,255,0.9)' }}
                  aria-hidden="true"
                />
              </span>

              <span className="relative mt-6 block">
                <span
                  className="block text-2xl font-bold"
                  style={{ fontFamily: 'var(--font-display)', color: '#FFFFFF' }}
                >
                  {banner.title}
                </span>
                <span
                  className="mt-1 block text-sm font-medium"
                  style={{ fontFamily: 'var(--font-body)', color: 'rgba(255,255,255,0.85)' }}
                >
                  {banner.subtitle}
                </span>
              </span>
            </Link>
          </ScrollReveal.Item>
        ))}
      </ScrollReveal>
    </div>
  </section>
);

export default PromoSection;
