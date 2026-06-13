import { Link } from "react-router-dom";

import logoSrc from "../assets/logo.webp";
import "./PolicyPage.css";

/**
 * Shared layout for the customer-facing legal/policy pages (Req 20.2).
 *
 * Renders a titled article of policy content plus a footer with links to every
 * policy page and back to the storefront, so the four policy pages (privacy,
 * terms, shipping, refund) present a consistent, navigable surface. All visual
 * styling consumes the shared design tokens in styles/tokens.css via
 * PolicyPage.css.
 *
 * @param {{ title: string, lastUpdated?: string, children: React.ReactNode }} props
 */

/** Policy/legal links surfaced in the footer of every policy page (Req 20.2). */
const POLICY_LINKS = [
  { to: "/privacy-policy", label: "Privacy Policy" },
  { to: "/refund-policy", label: "Refund Policy" },
  { to: "/shipping-policy", label: "Shipping Policy" },
  { to: "/terms-of-service", label: "Terms & Conditions" },
];

export default function PolicyPage({ title, lastUpdated, children }) {
  return (
    <main className="policy">
      <header className="policy__header">
        <span className="policy__logo">
          <img src={logoSrc} alt="Planet of Toys" className="policy__logo-img" />
        </span>
      </header>

      <article className="policy__content">
        <h1 className="policy__title">{title}</h1>
        {lastUpdated ? (
          <p className="policy__updated">Last updated: {lastUpdated}</p>
        ) : null}
        {children}
      </article>

      <footer className="policy__footer">
        <nav className="policy__footer-links" aria-label="Policies">
          {POLICY_LINKS.map((link) => (
            <Link key={link.label} to={link.to} className="policy__footer-link">
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="policy__copy">
          © {new Date().getFullYear()} Planet of Toys
        </p>
      </footer>
    </main>
  );
}
