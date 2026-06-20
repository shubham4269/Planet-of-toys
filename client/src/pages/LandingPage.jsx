import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";

import apiClient, { ApiError } from "../lib/apiClient.js";
import pixel from "../lib/pixel.js";
import { captureUtm } from "../lib/utm.js";
import { formatINR, mediaUrl } from "../lib/format.js";
import logoSrc from "../assets/logo.webp";
import "./LandingPage.css";

/**
 * Product Landing Page (Req 1, 2, 3).
 *
 * Melissa-&-Doug-inspired layout with SVG icons instead of emojis.
 */

/* ---- SVG Icon Components ---- */

function IconShield() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="landing__svg-icon">
      <path d="M24 4L6 12v12c0 11 8 18 18 22 10-4 18-11 18-22V12L24 4z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      <path d="M17 24l5 5 9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconGraduate() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="landing__svg-icon">
      <path d="M24 6L4 18l20 12 20-12L24 6z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      <path d="M10 22v12l14 8 14-8V22" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      <path d="M44 18v14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function IconPalette() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="landing__svg-icon">
      <path d="M24 4C12.95 4 4 12.95 4 24s8.95 20 20 20c2.2 0 4-1.8 4-4 0-1-.4-1.9-1-2.6-.6-.7-1-1.6-1-2.6 0-2.2 1.8-4 4-4h4.7c6.1 0 11.3-5 11.3-11.2C44 12 35 4 24 4z" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <circle cx="14" cy="20" r="3" fill="currentColor" />
      <circle cx="22" cy="12" r="3" fill="currentColor" />
      <circle cx="32" cy="14" r="3" fill="currentColor" />
      <circle cx="36" cy="22" r="3" fill="currentColor" />
    </svg>
  );
}

function IconStar() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="landing__svg-icon">
      <path d="M24 4l6.2 12.6L44 18.5l-10 9.7 2.4 13.8L24 35.5 11.6 42l2.4-13.8-10-9.7 13.8-1.9L24 4z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="landing__svg-icon">
      <rect x="8" y="20" width="32" height="22" rx="4" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <path d="M14 20V14a10 10 0 0120 0v6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="24" cy="31" r="3" fill="currentColor" />
    </svg>
  );
}

function IconCash() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="landing__svg-icon">
      <rect x="4" y="10" width="40" height="28" rx="4" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <circle cx="24" cy="24" r="7" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <path d="M24 20v8M21 22h6M21 26h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconTruck() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="landing__svg-icon">
      <path d="M4 10h24v22H4z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      <path d="M28 18h8l6 8v6h-6" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      <circle cx="12" cy="34" r="4" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <circle cx="36" cy="34" r="4" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <path d="M16 32h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="landing__svg-icon">
      <path d="M8 8h32a4 4 0 014 4v18a4 4 0 01-4 4H18l-8 8v-8a4 4 0 01-4-4V12a4 4 0 014-4z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      <path d="M16 20h16M16 26h10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function IconDescription() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="landing__panel-svg">
      <path d="M4 4h16v16H4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      <path d="M7 8h10M7 12h10M7 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconFeatures() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="landing__panel-svg">
      <path d="M12 2l3 6 6.5 1-4.7 4.6 1.1 6.4L12 17l-5.9 3 1.1-6.4L2.5 9l6.5-1L12 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function IconPackage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="landing__panel-svg">
      <path d="M3 8l9-5 9 5v8l-9 5-9-5V8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      <path d="M3 8l9 5 9-5M12 13v9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconRuler() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="landing__panel-svg">
      <rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M6 6v4M10 6v6M14 6v4M18 6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconQuestion() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="landing__panel-svg">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M9 9a3 3 0 015.2 2c0 2-3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="landing__panel-svg">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M10 8l6 4-6 4V8z" fill="currentColor" />
    </svg>
  );
}

/** Chevron SVG for accordion toggle. */
function ChevronIcon({ open }) {
  return (
    <svg
      className={`landing__chevron${open ? " landing__chevron--open" : ""}`}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Static benefit cards. */
const BENEFITS = [
  { Icon: IconShield, title: "Safe For Kids", text: "Non-toxic, child-safe materials.", color: "green" },
  { Icon: IconGraduate, title: "Educational Value", text: "Learning through hands-on play.", color: "blue" },
  { Icon: IconPalette, title: "Improves Creativity", text: "Sparks imagination and design.", color: "red" },
  { Icon: IconStar, title: "Premium Quality", text: "Durable, tested, built to last.", color: "yellow" },
];

/** Static trust items. */
const TRUST_ITEMS = [
  { Icon: IconLock, label: "Secure Payments" },
  { Icon: IconCash, label: "Cash On Delivery Available" },
  { Icon: IconTruck, label: "Fast Shipping" },
  { Icon: IconChat, label: "Customer Support" },
];

/** Footer links (Req 20.2). */
const FOOTER_LINKS = [
  { to: "/", label: "About Us" },
  { to: "/", label: "Contact Us" },
  { to: "/privacy-policy", label: "Privacy Policy" },
  { to: "/refund-policy", label: "Refund Policy" },
  { to: "/shipping-policy", label: "Shipping Policy" },
  { to: "/terms-of-service", label: "Terms & Conditions" },
];

export default function LandingPage() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [status, setStatus] = useState("loading");
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [openPanels, setOpenPanels] = useState({ description: true });
  const [showSticky, setShowSticky] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const heroRef = useRef(null);

  useEffect(() => {
    captureUtm();
    pixel.pageView();
    pixel.viewContent();
  }, []);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setQuantity(1);
    setActiveImage(0);
    setOpenPanels({ description: true });

    apiClient
      .get(`/api/products/${slug}`)
      .then((res) => {
        if (!active) return;
        const resolved = res?.product ?? res;
        if (!resolved) { setStatus("notfound"); return; }
        setProduct(resolved);
        setStatus("ready");
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) setStatus("notfound");
        else setStatus("error");
      });

    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowSticky(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [status]);

  const discountPercent = useMemo(() => {
    if (!product) return 0;
    if (Number.isFinite(product.discountPercent)) return product.discountPercent;
    const compare = Number(product.compareAtPrice);
    const price = Number(product.price);
    if (compare > 0 && price >= 0 && price <= compare) {
      return Math.round(((compare - price) / compare) * 100);
    }
    return 0;
  }, [product]);

  const total = useMemo(() => {
    if (!product) return 0;
    return Number(product.price) * quantity;
  }, [product, quantity]);

  function togglePanel(key) {
    setOpenPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (status === "loading") {
    return (
      <main className="landing landing--state" aria-busy="true">
        <p>Loading product…</p>
      </main>
    );
  }

  if (status === "notfound") {
    return (
      <main className="landing landing--state">
        <section className="landing__notfound">
          <h1>Product not found</h1>
          <p>The toy you are looking for is unavailable or no longer active.</p>
          <Link className="landing__link-cta" to="/">Back to home</Link>
        </section>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="landing landing--state">
        <section className="landing__notfound">
          <h1>Something went wrong</h1>
          <p>We couldn't load this product. Please try again.</p>
          <Link className="landing__link-cta" to="/">Back to home</Link>
        </section>
      </main>
    );
  }

  const outOfStock = Number(product.stock) === 0;
  const hasCompareAt =
    Number.isFinite(Number(product.compareAtPrice)) &&
    Number(product.compareAtPrice) > Number(product.price);

  const images = Array.isArray(product.images) ? product.images : [];
  const features = Array.isArray(product.features) ? product.features : [];
  const specifications = Array.isArray(product.specifications) ? product.specifications : [];
  const faqs = Array.isArray(product.faqs) ? product.faqs : [];
  const trustBadges = Array.isArray(product.trustBadges) ? product.trustBadges : [];

  function decreaseQuantity() { setQuantity((q) => Math.max(1, q - 1)); }
  function increaseQuantity() { setQuantity((q) => q + 1); }
  function handleBuyNow() {
    if (outOfStock) return;
    navigate("/checkout", { state: { slug: product.slug, quantity } });
  }

  return (
    <main className="landing">
      {/* ---- Sticky header bar ---- */}
      <div className={`landing__sticky-bar${showSticky ? " landing__sticky-bar--visible" : ""}`}>
        <div className="landing__sticky-bar-inner">
          <span className="landing__sticky-bar-name">{product.name}</span>
          <span className="landing__sticky-bar-price">{formatINR(product.price)}</span>
          <div className="landing__qty-compact">
            <button type="button" onClick={decreaseQuantity} disabled={quantity <= 1} aria-label="Decrease quantity">−</button>
            <span>{quantity}</span>
            <button type="button" onClick={increaseQuantity} aria-label="Increase quantity">+</button>
          </div>
          <button type="button" className="landing__sticky-bar-cta" onClick={handleBuyNow} disabled={outOfStock}>
            {outOfStock ? "Out of Stock" : "Buy Now"}
          </button>
        </div>
      </div>

      {/* ---- Header ---- */}
      <header className="landing__header">
        {/* Mobile hamburger (left of logo) */}
        <button
          type="button"
          className="landing__hamburger"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
        >
          <span className="landing__hamburger-bar" />
          <span className="landing__hamburger-bar" />
          <span className="landing__hamburger-bar" />
        </button>
        <Link to="/" className="landing__logo">
          <img src={logoSrc} alt="Planet of Toys" className="landing__logo-img" />
        </Link>
        {/* Desktop nav (inline, right side) */}
        <nav className="landing__header-nav landing__header-nav--desktop">
          <Link to="/" className="landing__header-link">Contact Us</Link>
          <a className="landing__whatsapp" href="https://wa.me/918448617222" target="_blank" rel="noreferrer">WhatsApp Us</a>
        </nav>
      </header>

      {/* Full-screen side panel overlay */}
      {menuOpen && (
        <>
          <div className="landing__overlay" onClick={() => setMenuOpen(false)} />
          <nav className="landing__side-panel">
            <div className="landing__side-panel-header">
              <Link to="/" className="landing__logo" onClick={() => setMenuOpen(false)}>
                <img src={logoSrc} alt="Planet of Toys" className="landing__logo-img" />
              </Link>
              <button
                type="button"
                className="landing__side-panel-close"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <Link to="/" className="landing__side-panel-link" onClick={() => setMenuOpen(false)}>
              <span>Contact Us</span>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Link>
            <a className="landing__side-panel-link" href="https://wa.me/918448617222" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>
              <span>WhatsApp Us</span>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </a>
          </nav>
        </>
      )}

      {/* ---- Hero ---- */}
      <section className="landing__hero" ref={heroRef}>
        {/* Gallery */}
        <div className="landing__gallery-wrapper">
          {images.length > 1 && (
            <div className="landing__thumbs">
              {images.map((image, index) => (
                <button
                  key={`thumb-${image}-${index}`}
                  type="button"
                  className={`landing__thumb${index === activeImage ? " landing__thumb--active" : ""}`}
                  onClick={() => setActiveImage(index)}
                  aria-label={`View image ${index + 1}`}
                >
                  <img src={mediaUrl(image)} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
          <div className="landing__main-image" data-testid="image-gallery">
            {images.length > 0 ? (
              <img className="landing__main-image-img" src={mediaUrl(images[activeImage] ?? images[0])} alt={`${product.name} — view ${activeImage + 1}`} />
            ) : (
              <div className="landing__main-image-placeholder" aria-hidden="true" />
            )}
          </div>
        </div>

        {/* Product info */}
        <div className="landing__hero-info">
          <h1 className="landing__title">{product.name}</h1>

          <div className="landing__pricing">
            <span className="landing__price" data-testid="price">{formatINR(product.price)}</span>
            {hasCompareAt && <span className="landing__compare" data-testid="compare-price">{formatINR(product.compareAtPrice)}</span>}
            {hasCompareAt && discountPercent > 0 && <span className="landing__discount" data-testid="discount">{discountPercent}% OFF</span>}
          </div>

          {outOfStock ? (
            <p className="landing__out-of-stock" data-testid="out-of-stock">Out of stock</p>
          ) : (
            <div className="landing__quantity">
              <div className="landing__quantity-control">
                <button type="button" className="landing__qty-btn" aria-label="Decrease quantity" onClick={decreaseQuantity} disabled={quantity <= 1}>−</button>
                <span className="landing__qty-value" data-testid="quantity">{quantity}</span>
                <button type="button" className="landing__qty-btn" aria-label="Increase quantity" onClick={increaseQuantity}>+</button>
              </div>
            </div>
          )}

          <button type="button" className="landing__cta landing__cta--primary" data-testid="buy-now" onClick={handleBuyNow} disabled={outOfStock}>
            {outOfStock ? "Out of Stock" : "Buy Now"}
          </button>

          <div className="landing__hero-meta">
            <span className="landing__badge">COD Available</span>
            <span className="landing__shipping-info">Fast shipping across India</span>
          </div>

          {/* ---- Accordion Panels ---- */}
          <div className="landing__panels">
            {product.description && (
              <div className="landing__panel">
                <button type="button" className="landing__panel-header" onClick={() => togglePanel("description")} aria-expanded={!!openPanels.description}>
                  <IconDescription />
                  <span className="landing__panel-title">Description</span>
                  <ChevronIcon open={!!openPanels.description} />
                </button>
                {openPanels.description && <div className="landing__panel-body"><p>{product.description}</p></div>}
              </div>
            )}

            {features.length > 0 && (
              <div className="landing__panel">
                <button type="button" className="landing__panel-header" onClick={() => togglePanel("features")} aria-expanded={!!openPanels.features}>
                  <IconFeatures />
                  <span className="landing__panel-title">Product Features</span>
                  <ChevronIcon open={!!openPanels.features} />
                </button>
                {openPanels.features && (
                  <div className="landing__panel-body">
                    <ul className="landing__feature-list">
                      {features.map((feature, i) => <li key={`feature-${i}`}>{feature}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {images.length > 1 && (
              <div className="landing__panel">
                <button type="button" className="landing__panel-header" onClick={() => togglePanel("included")} aria-expanded={!!openPanels.included}>
                  <IconPackage />
                  <span className="landing__panel-title">What's Included</span>
                  <ChevronIcon open={!!openPanels.included} />
                </button>
                {openPanels.included && (
                  <div className="landing__panel-body">
                    <div className="landing__included-grid">
                      {images.map((image, index) => (
                        <figure key={`included-${image}-${index}`} className="landing__included-card">
                          <img className="landing__included-image" src={mediaUrl(image)} alt={`${product.name} — included item ${index + 1}`} loading="lazy" />
                        </figure>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {specifications.length > 0 && (
              <div className="landing__panel">
                <button type="button" className="landing__panel-header" onClick={() => togglePanel("specs")} aria-expanded={!!openPanels.specs}>
                  <IconRuler />
                  <span className="landing__panel-title">Specifications</span>
                  <ChevronIcon open={!!openPanels.specs} />
                </button>
                {openPanels.specs && (
                  <div className="landing__panel-body">
                    <dl className="landing__spec-list">
                      {specifications.map((spec, index) => (
                        <div key={`spec-${index}`} className="landing__spec-row">
                          <dt className="landing__spec-key">{spec.key}</dt>
                          <dd className="landing__spec-value">{spec.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>
            )}

            {faqs.length > 0 && (
              <div className="landing__panel">
                <button type="button" className="landing__panel-header" onClick={() => togglePanel("faq")} aria-expanded={!!openPanels.faq}>
                  <IconQuestion />
                  <span className="landing__panel-title">Frequently Asked Questions</span>
                  <ChevronIcon open={!!openPanels.faq} />
                </button>
                {openPanels.faq && (
                  <div className="landing__panel-body">
                    {faqs.map((faq, index) => (
                      <div key={`faq-${index}`} className="landing__faq-item">
                        <strong>{faq.question}</strong>
                        <p>{faq.answer}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---- Video ---- */}
      {product.video && (
        <section className="landing__section landing__video-section">
          <h2 className="landing__section-title">
            <IconPlay />
            <span>See It In Action</span>
          </h2>
          <div className="landing__video-wrapper">
            <video className="landing__video" data-testid="product-video" src={mediaUrl(product.video)} controls playsInline preload="metadata" />
          </div>
        </section>
      )}

      {/* ---- Benefits ---- */}
      <section className="landing__section landing__benefits">
        <h2 className="landing__section-title">Why Parents Love It</h2>
        <div className="landing__benefit-grid">
          {BENEFITS.map((benefit) => (
            <article key={benefit.title} className={`landing__card landing__benefit landing__benefit--${benefit.color}`}>
              <div className={`landing__benefit-icon-wrap landing__benefit-icon-wrap--${benefit.color}`}>
                <benefit.Icon />
              </div>
              <h3 className="landing__benefit-title">{benefit.title}</h3>
              <p className="landing__benefit-text">{benefit.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---- Trust ---- */}
      <section className="landing__section landing__trust">
        <h2 className="landing__section-title">Shop With Confidence</h2>
        <div className="landing__trust-grid">
          {TRUST_ITEMS.map((item) => (
            <div key={item.label} className="landing__trust-item" data-testid="trust-badge">
              <div className="landing__trust-icon-wrap">
                <item.Icon />
              </div>
              <span className="landing__trust-label">{item.label}</span>
            </div>
          ))}
          {trustBadges.map((badge, index) => (
            <div key={`badge-${index}`} className="landing__trust-item" data-testid="trust-badge">
              <div className="landing__trust-icon-wrap">
                <IconShield />
              </div>
              <span className="landing__trust-label">{badge}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="landing__footer">
        <nav className="landing__footer-links">
          {FOOTER_LINKS.map((link) => (
            <Link key={link.label} to={link.to} className="landing__footer-link">{link.label}</Link>
          ))}
        </nav>
        <p className="landing__footer-copy">© {new Date().getFullYear()} Planet of Toys</p>
      </footer>

      {/* ---- Mobile sticky CTA ---- */}
      <div className="landing__sticky-cta" data-testid="sticky-cta">
        <div className="landing__sticky-info">
          <span className="landing__sticky-label">Total</span>
          <span className="landing__sticky-price">{formatINR(total)}</span>
        </div>
        <button type="button" className="landing__cta landing__cta--primary landing__sticky-buy" data-testid="sticky-buy-now" onClick={handleBuyNow} disabled={outOfStock}>
          {outOfStock ? "Out of Stock" : "Buy Now"}
        </button>
      </div>
    </main>
  );
}
