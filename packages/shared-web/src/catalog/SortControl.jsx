// packages/shared-web/src/catalog/SortControl.jsx
/** Sort options shown to shoppers; values match the server SORT_SPECS keys. */
export const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name", label: "Name" },
  { value: "best-selling", label: "Best Selling" },
];

/**
 * SortControl — labelled <select> for the product sort. Controlled.
 * @param {{value:string,onChange:(v:string)=>void}} props
 */
export default function SortControl({ value = "featured", onChange }) {
  return (
    <label className="pot-sort">
      <span className="pot-sort__label">Sort</span>
      <select className="pot-sort__select" value={value} onChange={(e) => onChange?.(e.target.value)}>
        {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
