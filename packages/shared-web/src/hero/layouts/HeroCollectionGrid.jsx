// packages/shared-web/src/hero/layouts/HeroCollectionGrid.jsx
import ProductCard from "../../catalog/ProductCard.jsx";

/** Collection-grid layout: heading + CTA + a small product grid (gridItems). */
export default function HeroCollectionGrid({ slide, resolveImageUrl = (x) => x, formatPrice = (n) => String(n) }) {
  const { title, subtitle, ctaText, ctaHref, gridItems = [] } = slide;
  return (
    <div className="pot-hero pot-hero-grid">
      <div className="pot-hero-grid__head">
        {title && <h2 className="pot-hero__title">{title}</h2>}
        {subtitle && <p className="pot-hero__subtitle">{subtitle}</p>}
        {ctaText && ctaHref && <a className="pot-hero__cta" href={ctaHref}>{ctaText}</a>}
      </div>
      <div className="pot-hero-grid__items">
        {gridItems.map((p) => (
          <ProductCard key={p.id} product={p} resolveImageUrl={resolveImageUrl} formatPrice={formatPrice} />
        ))}
      </div>
    </div>
  );
}
