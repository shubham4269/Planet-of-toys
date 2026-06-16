// packages/shared-web/src/catalog/ProductGrid.jsx
import ProductCard from "./ProductCard.jsx";

/**
 * ProductGrid — responsive grid of ProductCard, with an empty state. Pure.
 *
 * @param {object} props
 * @param {Array} props.products
 * @param {(filename:string)=>string} [props.resolveImageUrl]
 * @param {(amount:number)=>string} [props.formatPrice]
 * @param {string} [props.emptyLabel]
 */
export default function ProductGrid({ products = [], resolveImageUrl, formatPrice, emptyLabel = "No products match your filters." }) {
  if (!products.length) return <p className="pot-grid__empty">{emptyLabel}</p>;
  return (
    <div className="pot-collection__grid">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} resolveImageUrl={resolveImageUrl} formatPrice={formatPrice} />
      ))}
    </div>
  );
}
