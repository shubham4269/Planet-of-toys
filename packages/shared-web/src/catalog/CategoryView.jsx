// packages/shared-web/src/catalog/CategoryView.jsx
/**
 * CategoryView — presentational category card grid. Pure: no fetching, no
 * routing. Used by both the admin live preview and the storefront. The consumer
 * supplies token-driven CSS (class names below) and an optional
 * `resolveImageUrl(filename)` to turn a stored media filename into a URL.
 *
 * @param {object} props
 * @param {Array<{id,name,image,childCount}>} props.categories
 * @param {(filename:string)=>string} [props.resolveImageUrl]
 * @param {(category:object)=>void} [props.onSelect]
 */
export default function CategoryView({ categories = [], resolveImageUrl = (x) => x, onSelect }) {
  if (!categories || categories.length === 0) return null;
  return (
    <div className="pot-cat-grid">
      {categories.map((c) => {
        const count = c.childCount || 0;
        const card = (
          <>
            <div className="pot-cat-card__media">
              {c.image
                ? <img src={resolveImageUrl(c.image)} alt={c.name} className="pot-cat-card__img" />
                : <span className="pot-cat-card__placeholder" aria-hidden="true" />}
            </div>
            <h3 className="pot-cat-card__name">{c.name}</h3>
            {count > 0 && (
              <p className="pot-cat-card__meta">{count} {count === 1 ? "subcategory" : "subcategories"}</p>
            )}
          </>
        );
        return onSelect
          ? <button key={c.id} type="button" className="pot-cat-card" onClick={() => onSelect(c)}>{card}</button>
          : <div key={c.id} className="pot-cat-card">{card}</div>;
      })}
    </div>
  );
}
