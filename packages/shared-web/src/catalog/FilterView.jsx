// packages/shared-web/src/catalog/FilterView.jsx
import AttributeFilterView from "./AttributeFilterView.jsx";

/**
 * FilterView — renders resolved filter definitions as interactive controls and
 * reports selection changes. Pure & controlled. Desktop: a sidebar panel. Mobile:
 * pass `open` + `onClose` to render it as a drawer (the consumer toggles `open`).
 * `selection` is keyed by each filter's `key`.
 *
 * @param {object} props
 * @param {Array} props.filters  resolved definitions (attribute|price|category)
 * @param {object} props.selection
 * @param {(next:object)=>void} props.onChange
 * @param {boolean} [props.open]   mobile drawer open
 * @param {()=>void} [props.onClose]
 */
export default function FilterView({ filters = [], selection = {}, onChange, open = false, onClose }) {
  const toggleValue = (key, valueSlug) => {
    const cur = Array.isArray(selection[key]) ? selection[key] : [];
    const next = cur.includes(valueSlug) ? cur.filter((s) => s !== valueSlug) : [...cur, valueSlug];
    const out = { ...selection };
    if (next.length) out[key] = next; else delete out[key];
    onChange(out);
  };
  const setPrice = (def, idx, raw) => {
    const cur = Array.isArray(selection.price) ? [...selection.price] : [def.min, def.max];
    cur[idx] = Number(raw);
    onChange({ ...selection, price: cur });
  };
  const setCategory = (slug) => {
    const out = { ...selection };
    if (slug) out.category = slug; else delete out.category;
    onChange(out);
  };

  return (
    <aside className={`pot-filterview${open ? " pot-filterview--open" : ""}`} aria-label="Filters">
      <div className="pot-filterview__head">
        <h2 className="pot-filterview__title">Filters</h2>
        {onClose && (
          <button type="button" className="pot-filterview__close" aria-label="Close filters" onClick={onClose}>×</button>
        )}
      </div>

      {filters.map((def) => {
        if (def.type === "attribute") {
          return (
            <AttributeFilterView key={def.key}
              attribute={{ id: def.key, name: def.name, displayType: def.displayType, values: def.values }}
              selected={selection[def.key] || []}
              onToggle={(valueSlug) => toggleValue(def.key, valueSlug)} />
          );
        }
        if (def.type === "price") {
          const cur = Array.isArray(selection.price) ? selection.price : [def.min, def.max];
          return (
            <fieldset key={def.key} className="pot-filter pot-filter--price">
              <legend className="pot-filter__title">Price</legend>
              <div className="pot-filter__price-row">
                <label className="pot-filter__price-field">
                  <span>Minimum price</span>
                  <input type="number" min={def.min} max={def.max} value={cur[0]} onChange={(e) => setPrice(def, 0, e.target.value)} />
                </label>
                <label className="pot-filter__price-field">
                  <span>Maximum price</span>
                  <input type="number" min={def.min} max={def.max} value={cur[1]} onChange={(e) => setPrice(def, 1, e.target.value)} />
                </label>
              </div>
            </fieldset>
          );
        }
        if (def.type === "category") {
          return (
            <fieldset key={def.key} className="pot-filter pot-filter--category">
              <legend className="pot-filter__title">Category</legend>
              {def.options.map((o) => (
                <label key={o.slug} className="pot-filter__opt">
                  <input type="radio" name="category" value={o.slug}
                    checked={selection.category === o.slug} onChange={() => setCategory(o.slug)} /> <span>{o.name}</span>
                </label>
              ))}
            </fieldset>
          );
        }
        return null;
      })}
    </aside>
  );
}
