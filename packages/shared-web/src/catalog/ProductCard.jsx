// packages/shared-web/src/catalog/ProductCard.jsx
/**
 * ProductCard — single product tile (image, name, price). Pure & presentational;
 * the single source of truth for product tiles across CollectionView and ProductGrid.
 *
 * @param {object} props
 * @param {{id,slug,name,price,compareAtPrice,discountPercent,images}} props.product
 * @param {(filename:string)=>string} [props.resolveImageUrl]
 * @param {(amount:number)=>string} [props.formatPrice]
 */
export default function ProductCard({ product, resolveImageUrl = (x) => x, formatPrice = (n) => String(n) }) {
  const img = Array.isArray(product.images) && product.images[0] ? resolveImageUrl(product.images[0]) : null;
  return (
    <article className="pot-prod-card">
      <div className="pot-prod-card__media">
        {img ? <img src={img} alt={product.name} className="pot-prod-card__img" />
             : <span className="pot-prod-card__placeholder" aria-hidden="true" />}
      </div>
      <h3 className="pot-prod-card__name">{product.name}</h3>
      <p className="pot-prod-card__price">{formatPrice(product.price)}</p>
    </article>
  );
}
