// packages/shared-web/src/catalog/NavigationView.jsx
import { useState } from "react";

/**
 * NavigationView — CMS-driven storefront navigation. Pure & presentational; the
 * consumer supplies CSS and `resolveImageUrl`. `variant="desktop"` renders a bar
 * with click-to-open mega panels (child link columns + featured collection cards);
 * `variant="mobile"` renders expandable drawer sections. Hrefs are already
 * resolved server-side. Used by the storefront Header and the admin preview.
 *
 * @param {object} props
 * @param {Array} props.items  resolved nav tree
 * @param {"desktop"|"mobile"} [props.variant]
 * @param {(filename:string)=>string} [props.resolveImageUrl]
 * @param {()=>void} [props.onNavigate]  called when a link is clicked (e.g. close drawer)
 */
export default function NavigationView({ items = [], variant = "desktop", resolveImageUrl = (x) => x, onNavigate }) {
  const [openId, setOpenId] = useState(null);
  if (!items || items.length === 0) return null;
  const linkProps = (i) => (i.openInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {});

  if (variant === "mobile") {
    return (
      <nav className="pot-nav pot-nav--mobile" aria-label="Main menu">
        <ul className="pot-nav__list">
          {items.map((item) => (
            <li key={item.id} className="pot-nav__m-item">
              {item.children && item.children.length ? (
                <>
                  <button type="button" className="pot-nav__m-top" aria-expanded={openId === item.id}
                    onClick={() => setOpenId(openId === item.id ? null : item.id)}>{item.label}</button>
                  {openId === item.id && (
                    <ul className="pot-nav__m-children">
                      {item.children.map((c) => (
                        <li key={c.id}><a className="pot-nav__m-link" href={c.href} {...linkProps(c)} onClick={onNavigate}>{c.label}</a></li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <a className="pot-nav__m-top" href={item.href} {...linkProps(item)} onClick={onNavigate}>{item.label}</a>
              )}
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <nav className="pot-nav pot-nav--desktop" aria-label="Main menu">
      <ul className="pot-nav__bar">
        {items.map((item) => {
          const mega = item.isMegaMenu && item.children && item.children.length > 0;
          if (!mega) {
            return (
              <li key={item.id} className="pot-nav__item">
                <a className="pot-nav__top" href={item.href} {...linkProps(item)} onClick={onNavigate}>{item.label}</a>
              </li>
            );
          }
          const links = item.children.filter((c) => !c.featured);
          const cards = item.children.filter((c) => c.featured);
          return (
            <li key={item.id} className="pot-nav__item" onMouseLeave={() => setOpenId((o) => (o === item.id ? null : o))}>
              <button type="button" className="pot-nav__top" aria-expanded={openId === item.id}
                onClick={() => setOpenId(openId === item.id ? null : item.id)}>{item.label}</button>
              {openId === item.id && (
                <div className="pot-nav__panel">
                  {links.length > 0 && (
                    <div className="pot-nav__links">
                      {links.map((c) => (
                        <a key={c.id} className="pot-nav__link" href={c.href} {...linkProps(c)} onClick={onNavigate}>{c.label}</a>
                      ))}
                    </div>
                  )}
                  {cards.length > 0 && (
                    <div className="pot-nav__featured">
                      {cards.map((c) => (
                        <a key={c.id} className="pot-nav__card" href={c.href} {...linkProps(c)} onClick={onNavigate}>
                          {c.image ? <img className="pot-nav__card-img" src={resolveImageUrl(c.image)} alt={c.label} />
                                   : <span className="pot-nav__card-ph" aria-hidden="true" />}
                          <span className="pot-nav__card-label">{c.label}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
