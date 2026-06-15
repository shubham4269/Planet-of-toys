// packages/shared-web/src/footer/FooterView.jsx
import { useState } from "react";

/**
 * Pure presentational storefront footer. Props are the public footer shape plus
 * an optional `onSubscribe(email)` and newsletter `status`/`message`. No data
 * fetching. All icons are inline SVG drawn in one lightweight line family
 * (viewBox 24, stroke 1.5, round caps/joins, no fills) — matching the site
 * header. Colors are token-driven via class names; the consuming app supplies
 * the CSS. Renders null when there is no content.
 */

/** Geometry-only icon bodies; the wrapper sets stroke/fill so the family is uniform. */
const SOCIAL_ICON = {
  facebook: <path d="M13.5 21v-7h2.3l.4-2.8h-2.7V9.4c0-.8.3-1.3 1.4-1.3H16V5.6c-.3 0-1.2-.1-2.2-.1-2.1 0-3.6 1.3-3.6 3.6v2H7.9V14h2.3v7z" />,
  instagram: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="5" />
      <circle cx="12" cy="12" r="3.8" />
      <circle cx="16.8" cy="7.2" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  youtube: (
    <>
      <rect x="3" y="6.5" width="18" height="11" rx="3.5" />
      <path d="M11 10l4 2-4 2z" />
    </>
  ),
  whatsapp: (
    <>
      <circle cx="12" cy="12" r="7.4" />
      <path d="M6 18.5 4.9 21l2.7-1" />
      <path d="M9.6 9.5c.2-.4.4-.4.6-.4h.4c.2 0 .4 0 .5.4l.5 1.2c0 .2 0 .3-.1.4l-.3.4c-.1.1-.2.2-.1.4.4.7 1.1 1.3 1.9 1.7.2.1.3.1.4 0l.4-.5c.1-.1.3-.2.4-.1l1.2.6c.2.1.2.2.2.4 0 .6-.6 1.1-1.1 1.2-.6.1-1.2 0-2.8-.9-1.8-1-2.8-2.9-2.9-3.1-.1-.2-.5-.9-.5-1.6s.4-1 .5-1.2z" />
    </>
  ),
  twitter: <path d="M6 6l12 12M18 6L6 18" />,
};
const TRUST_ICON = {
  shield: <path d="M12 3l7 3v5c0 4-3 6.5-7 8-4-1.5-7-4-7-8V6z" />,
  truck: (
    <>
      <path d="M3 7h10v8H3zM13 10h4l3 3v2h-7z" />
      <circle cx="7" cy="17" r="1.6" />
      <circle cx="17" cy="17" r="1.6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 018 0v3" />
    </>
  ),
  gift: (
    <>
      <rect x="4" y="9" width="16" height="11" rx="1.5" />
      <path d="M4 13h16M12 9v11M9 9a2 2 0 110-4c2 0 3 4 3 4M15 9a2 2 0 100-4c-2 0-3 4-3 4" />
    </>
  ),
  star: <path d="M12 4l2.3 4.7 5.2.8-3.7 3.6.9 5.1L12 15.8 7.3 18.2l.9-5.1L4.5 9.5l5.2-.8z" />,
  heart: <path d="M12 20s-7-4.3-9-8c-1.5-3 .5-6 3.5-6 2 0 3.5 1.3 5.5 3.5C16 4.3 17.5 3 19.5 3c3 0 5 3 3.5 6-2 3.7-9 8-9 8z" />,
};
const ENVELOPE = (
  <>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="M4 7.5l8 5.5 8-5.5" />
  </>
);
const ARROW = <path d="M5 12h13M13 6l6 6-6 6" />;

/** One uniform icon wrapper: line family, round joins, no fill. */
const icon = (child, size = 20) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {child}
  </svg>
);

export default function FooterView({
  columns = [], newsletter, membershipPromo, social = [], contact = {},
  trustHighlights = [], bottomLinks = [], copyrightText = "",
  onSubscribe, status = "idle", message = "",
}) {
  const [email, setEmail] = useState("");
  const hasContact = contact && Object.values(contact).some(Boolean);
  const nothing =
    columns.length === 0 && !newsletter && !membershipPromo && social.length === 0 &&
    !hasContact && trustHighlights.length === 0 && bottomLinks.length === 0 && !copyrightText;
  if (nothing) return null;

  function handleSubmit(e) {
    e.preventDefault();
    if (onSubscribe) onSubscribe(email);
  }

  return (
    <footer className="pot-footer">
      <div className="pot-footer__main">
        <div className="pot-footer__left">
          {columns.length > 0 && (
            <div className="pot-footer__columns">
              {columns.map((col) => (
                <nav key={col.id} className="pot-footer__col" aria-label={col.title || "Footer"}>
                  {col.title && <h3 className="pot-footer__col-title">{col.title}</h3>}
                  <ul>
                    {col.links.map((l) => (
                      <li key={l.id}><a href={l.url} className="pot-footer__link">{l.label}</a></li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>
          )}
          {trustHighlights.length > 0 && (
            <ul className="pot-footer__trust">
              {trustHighlights.map((t) => (
                <li key={t.id} className="pot-footer__trust-item">
                  <span className="pot-footer__trust-icon">{icon(TRUST_ICON[t.iconKey] || TRUST_ICON.shield, 24)}</span>
                  <span className="pot-footer__trust-text">
                    <strong>{t.title}</strong>
                    {t.subtitle && <span className="pot-footer__trust-sub">{t.subtitle}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {hasContact && (
            <address className="pot-footer__contact">
              {contact.companyName && <div className="pot-footer__contact-name">{contact.companyName}</div>}
              {contact.address && <div>{contact.address}</div>}
              {contact.phone && <div>Phone: {contact.phone}</div>}
              {contact.whatsapp && <div>WhatsApp: {contact.whatsapp}</div>}
              {contact.email && <div>Email: {contact.email}</div>}
              {contact.supportHours && <div>{contact.supportHours}</div>}
            </address>
          )}
        </div>

        <aside className="pot-footer__community">
          {newsletter && (
            <div className="pot-footer__newsletter">
              <span className="pot-footer__newsletter-mark">{icon(ENVELOPE, 40)}</span>
              {newsletter.title && <h3 className="pot-footer__community-title">{newsletter.title}</h3>}
              {newsletter.subtitle && <p className="pot-footer__community-sub">{newsletter.subtitle}</p>}
              <form className="pot-footer__form" onSubmit={handleSubmit}>
                <input
                  type="email" className="pot-footer__input" aria-label="Email address"
                  placeholder={newsletter.placeholder || "Enter your email"}
                  value={email} onChange={(e) => setEmail(e.target.value)} required
                />
                <button
                  type="submit"
                  className="pot-footer__subscribe"
                  aria-label={newsletter.buttonLabel || "Subscribe"}
                  disabled={status === "loading"}
                >
                  {icon(ARROW, 22)}
                </button>
              </form>
              {message && (
                <p className={`pot-footer__msg pot-footer__msg--${status}`} role="status">{message}</p>
              )}
            </div>
          )}
          {membershipPromo && (membershipPromo.title || membershipPromo.description) && (
            <div className="pot-footer__membership">
              {membershipPromo.title && <h4 className="pot-footer__membership-title">{membershipPromo.title}</h4>}
              {membershipPromo.description && <p>{membershipPromo.description}</p>}
              {membershipPromo.buttonLabel && (
                <a href={membershipPromo.buttonUrl || "#"} className="pot-footer__membership-btn">{membershipPromo.buttonLabel}</a>
              )}
            </div>
          )}
          {social.length > 0 && (
            <div className="pot-footer__social">
              {social.map((s) => (
                <a key={s.id} href={s.url} className="pot-footer__social-link" aria-label={s.platform}
                  target="_blank" rel="noopener noreferrer">
                  {icon(SOCIAL_ICON[s.platform] || SOCIAL_ICON.facebook, 20)}
                </a>
              ))}
            </div>
          )}
        </aside>
      </div>

      {(bottomLinks.length > 0 || copyrightText) && (
        <div className="pot-footer__bottom">
          {copyrightText && <span className="pot-footer__copyright">{copyrightText}</span>}
          {bottomLinks.length > 0 && (
            <nav className="pot-footer__bottom-links" aria-label="Legal">
              {bottomLinks.map((l) => (<a key={l.id} href={l.url} className="pot-footer__link">{l.label}</a>))}
            </nav>
          )}
        </div>
      )}
    </footer>
  );
}
