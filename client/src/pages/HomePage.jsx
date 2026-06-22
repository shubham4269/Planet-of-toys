import { useEffect } from "react";
import { Link } from "react-router-dom";

import pixel from "../lib/pixel.js";
import logoSrc from "../assets/logo.webp";
import "./HomePage.css";

/**
 * Public homepage — "Website Coming Soon" (root route `/`).
 *
 * This is the only generally-reachable storefront page outside the paid-ads
 * funnel. It exists so the site root is live and reachable for payment-gateway
 * (Razorpay) and ad-platform (Meta) website verification, which require the
 * domain root to return a real, accessible page rather than a 403.
 *
 * Deliberately content-light: brand, a coming-soon message, contact options,
 * and the legal/policy links that verification reviews look for. It links into
 * the funnel only via the policy pages, so it does not expose product browsing.
 */

/** Support contact details surfaced for customers and verification reviews. */
const SUPPORT_WHATSAPP = "918448617222";
const SUPPORT_EMAIL = "support@planetoftoys.in";

/** Legal/policy links shown in the footer (Req 20.2). */
const POLICY_LINKS = [
  { to: "/privacy-policy", label: "Privacy Policy" },
  { to: "/refund-policy", label: "Refund Policy" },
  { to: "/shipping-policy", label: "Shipping Policy" },
  { to: "/terms-of-service", label: "Terms & Conditions" },
];

export default function HomePage() {
  useEffect(() => {
    pixel.pageView();
  }, []);

  return (
    <main className="home" aria-labelledby="home-title">
      <section className="home__card">
        <img className="home__logo" src={logoSrc} alt="Planet of Toys" />

        <p className="home__eyebrow">Planet of Toys</p>
        <h1 id="home-title" className="home__title">
          Our store is coming soon
        </h1>
        <p className="home__lead">
          We're putting the finishing touches on a brand-new home for safe,
          educational and fun toys for kids. Check back shortly.
        </p>

        <div className="home__contact">
          <a
            className="home__btn home__btn--primary"
            href={`https://wa.me/${SUPPORT_WHATSAPP}`}
            target="_blank"
            rel="noreferrer"
          >
            Chat on WhatsApp
          </a>
          <a className="home__btn" href={`mailto:${SUPPORT_EMAIL}`}>
            Email Us
          </a>
        </div>

        <address className="home__address">
          Questions? Reach us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </address>
      </section>

      <footer className="home__footer">
        <nav className="home__footer-links" aria-label="Legal">
          {POLICY_LINKS.map((link) => (
            <Link key={link.to} to={link.to} className="home__footer-link">
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="home__copy">
          © {new Date().getFullYear()} Planet of Toys. All rights reserved.
        </p>
      </footer>
    </main>
  );
}
