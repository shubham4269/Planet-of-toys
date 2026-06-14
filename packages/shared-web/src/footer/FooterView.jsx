// packages/shared-web/src/footer/FooterView.jsx
import { useState } from "react";

/**
 * Pure presentational storefront footer. Props are the public footer shape plus
 * an optional `onSubscribe(email)` and newsletter `status`/`message`. No data
 * fetching. All icons inline SVG. Colors are token-driven via class names; the
 * consuming app supplies the CSS. Renders null when there is no content.
 */
const SOCIAL_ICON = {
  facebook: <path d="M14 9h2V6h-2c-1.7 0-3 1.3-3 3v2H9v3h2v5h3v-5h2.1l.4-3H14v-1.5c0-.3.2-.5.5-.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
  instagram: <><rect x="4" y="4" width="16" height="16" rx="4.5" stroke="currentColor" strokeWidth="1.5" /><circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5" /><circle cx="16.5" cy="7.5" r="1" fill="currentColor" /></>,
  youtube: <><rect x="3" y="6" width="18" height="12" rx="3.5" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 9.5l4 2.5-4 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></>,
  whatsapp: <path d="M5 19l1.2-3.4A6.5 6.5 0 1118 18.6 6.5 6.5 0 015 19zm5-9c-.3 0-.6.1-.8.5-.2.4-.7 1-.7 1.8s.6 1.7.9 2.1c.3.4 1.4 1.8 3.1 2.4 1.5.6 1.8.5 2.2.4.4-.1 1-.5 1.1-.9.1-.4.1-.8 0-.9-.1-.1-.3-.2-.6-.3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />,
  twitter: <path d="M18 6l-5.2 6.3L18.5 19h-3.3l-3-3.9L8.7 19H6l5.5-6.6L6 6h3.3l2.7 3.6L15.3 6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />,
};
const TRUST_ICON = {
  shield: <path d="M12 3l7 3v5c0 4-3 6.5-7 8-4-1.5-7-4-7-8V6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
  truck: <><path d="M3 7h10v8H3zM13 10h4l3 3v2h-7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><circle cx="7" cy="17" r="1.6" stroke="currentColor" strokeWidth="1.5" /><circle cx="17" cy="17" r="1.6" stroke="currentColor" strokeWidth="1.5" /></>,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.5" /></>,
  gift: <><rect x="4" y="9" width="16" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><path d="M4 13h16M12 9v11M9 9a2 2 0 110-4c2 0 3 4 3 4M15 9a2 2 0 100-4c-2 0-3 4-3 4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></>,
  star: <path d="M12 4l2.3 4.7 5.2.8-3.7 3.6.9 5.1L12 15.8 7.3 18.2l.9-5.1L4.5 9.5l5.2-.8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
  heart: <path d="M12 20s-7-4.3-9-8c-1.5-3 .5-6 3.5-6 2 0 3.5 1.3 5.5 3.5C16 4.3 17.5 3 19.5 3c3 0 5 3 3.5 6-2 3.7-9 8-9 8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
};
const svg = (child) => (<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">{child}</svg>);

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
                  <span className="pot-footer__trust-icon">{svg(TRUST_ICON[t.iconKey] || TRUST_ICON.shield)}</span>
                  <span><strong>{t.title}</strong>{t.subtitle && <span className="pot-footer__trust-sub">{t.subtitle}</span>}</span>
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
              {newsletter.title && <h3 className="pot-footer__community-title">{newsletter.title}</h3>}
              {newsletter.subtitle && <p className="pot-footer__community-sub">{newsletter.subtitle}</p>}
              <form className="pot-footer__form" onSubmit={handleSubmit}>
                <input
                  type="email" className="pot-footer__input" aria-label="Email address"
                  placeholder={newsletter.placeholder || "Enter your email"}
                  value={email} onChange={(e) => setEmail(e.target.value)} required
                />
                <button type="submit" className="pot-footer__subscribe" disabled={status === "loading"}>
                  {status === "loading" ? "…" : (newsletter.buttonLabel || "Subscribe")}
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
                  {svg(SOCIAL_ICON[s.platform])}
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
