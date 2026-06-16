// packages/shared-web/src/hero/layouts/HeroFullBanner.jsx
/** Full-width banner: responsive media + overlaid title/subtitle + CTA. `eventClass`
 *  lets the event layout reuse this with an extra class. */
export default function HeroFullBanner({ slide, resolveImageUrl = (x) => x, eager = false, eventClass = "" }) {
  const { title, subtitle, ctaText, ctaHref, desktopMedia, mobileMedia } = slide;
  const desktop = desktopMedia ? resolveImageUrl(desktopMedia) : null;
  const mobile = mobileMedia ? resolveImageUrl(mobileMedia) : desktop;
  return (
    <div className={`pot-hero pot-hero--full ${eventClass}`.trim()}>
      {desktop && (
        <picture className="pot-hero__media">
          {mobile && <source media="(max-width: 768px)" srcSet={mobile} />}
          <img src={desktop} alt={title || ""} loading={eager ? "eager" : "lazy"} className="pot-hero__img" />
        </picture>
      )}
      <div className="pot-hero__overlay">
        {title && <h2 className="pot-hero__title">{title}</h2>}
        {subtitle && <p className="pot-hero__subtitle">{subtitle}</p>}
        {ctaText && ctaHref && <a className="pot-hero__cta" href={ctaHref}>{ctaText}</a>}
      </div>
    </div>
  );
}
