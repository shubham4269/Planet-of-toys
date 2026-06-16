// packages/shared-web/src/hero/layouts/HeroSplit.jsx
/** Split layout: media on one side, text + CTA on the other. */
export default function HeroSplit({ slide, resolveImageUrl = (x) => x, eager = false }) {
  const { title, subtitle, ctaText, ctaHref, desktopMedia, mobileMedia } = slide;
  const desktop = desktopMedia ? resolveImageUrl(desktopMedia) : null;
  const mobile = mobileMedia ? resolveImageUrl(mobileMedia) : desktop;
  return (
    <div className="pot-hero pot-hero-split">
      <div className="pot-hero-split__media">
        {desktop && (
          <picture>
            {mobile && <source media="(max-width: 768px)" srcSet={mobile} />}
            <img src={desktop} alt={title || ""} loading={eager ? "eager" : "lazy"} className="pot-hero__img" />
          </picture>
        )}
      </div>
      <div className="pot-hero-split__text">
        {title && <h2 className="pot-hero__title">{title}</h2>}
        {subtitle && <p className="pot-hero__subtitle">{subtitle}</p>}
        {ctaText && ctaHref && <a className="pot-hero__cta" href={ctaHref}>{ctaText}</a>}
      </div>
    </div>
  );
}
