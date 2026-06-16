// packages/shared-web/src/hero/layouts/HeroVideo.jsx
import { useEffect, useRef, useState } from "react";

/** Video layout: muted autoplay loop video (plays only when `active`) + unmute toggle + CTA. */
export default function HeroVideo({ slide, resolveImageUrl = (x) => x, active = true }) {
  const { title, subtitle, ctaText, ctaHref, video, posterImage } = slide;
  const ref = useRef(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      if (active) { const p = el.play?.(); if (p && p.catch) p.catch(() => {}); }
      else { el.pause?.(); }
    } catch { /* play()/pause() unsupported (e.g. jsdom) — ignore */ }
  }, [active]);

  return (
    <div className="pot-hero pot-hero--video">
      {video && (
        <video ref={ref} className="pot-hero__video" muted={muted} loop playsInline preload="none"
          poster={posterImage ? resolveImageUrl(posterImage) : undefined} autoPlay={active}>
          <source src={resolveImageUrl(video)} type="video/mp4" />
        </video>
      )}
      <button type="button" className="pot-hero__mute" onClick={() => setMuted((m) => !m)}
        aria-label={muted ? "Unmute video" : "Mute video"}>{muted ? "Unmute" : "Mute"}</button>
      <div className="pot-hero__overlay">
        {title && <h2 className="pot-hero__title">{title}</h2>}
        {subtitle && <p className="pot-hero__subtitle">{subtitle}</p>}
        {ctaText && ctaHref && <a className="pot-hero__cta" href={ctaHref}>{ctaText}</a>}
      </div>
    </div>
  );
}
