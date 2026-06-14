import "../ContentPage.css";

/**
 * Content > Hero Banner sub-page (placeholder). Reserved slot in the Content
 * folder; the hero-slider management UI is built in a later task.
 */
export default function HeroBannerPage() {
  return (
    <div className="promo-editor">
      <header className="promo-editor__head">
        <h1>Hero Banner</h1>
      </header>
      <section className="promo-card">
        <div className="promo-card__head"><h2>Coming soon</h2></div>
        <p style={{ padding: "1rem", margin: 0, color: "var(--admin-text-muted, #64748B)" }}>
          Hero slider management will live here.
        </p>
      </section>
    </div>
  );
}
