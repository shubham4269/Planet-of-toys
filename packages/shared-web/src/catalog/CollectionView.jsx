// packages/shared-web/src/catalog/CollectionView.jsx
import ProductCard from "./ProductCard.jsx";
/**
 * CollectionView — presentational collection page: a hero band (title/subtitle/
 * image) followed by a product card grid. Pure and responsive (the grid reflows
 * to the container width, so the same component drives desktop + mobile preview
 * and the storefront). Consumer supplies CSS, `resolveImageUrl`, and `formatPrice`.
 *
 * @param {object} props
 * @param {{id,name,heroTitle,heroSubtitle,heroImage,description}|null} props.collection
 * @param {Array<{id,slug,name,price,compareAtPrice,discountPercent,images}>} [props.products]
 * @param {(filename:string)=>string} [props.resolveImageUrl]
 * @param {(amount:number)=>string} [props.formatPrice]
 */
export default function CollectionView({
  collection, products = [], resolveImageUrl = (x) => x, formatPrice = (n) => String(n),
}) {
  if (!collection) return null;
  const title = collection.heroTitle || collection.name;
  return (
    <section className="pot-collection">
      <header
        className={`pot-collection__hero${collection.heroImage ? " pot-collection__hero--image" : ""}`}
        style={collection.heroImage ? { backgroundImage: `url(${resolveImageUrl(collection.heroImage)})` } : undefined}
      >
        <div className="pot-collection__hero-inner">
          <h1 className="pot-collection__title">{title}</h1>
          {collection.heroSubtitle && <p className="pot-collection__subtitle">{collection.heroSubtitle}</p>}
        </div>
      </header>

      {products.length > 0 ? (
        <div className="pot-collection__grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} resolveImageUrl={resolveImageUrl} formatPrice={formatPrice} />
          ))}
        </div>
      ) : (
        <p className="pot-collection__empty">No products in this collection yet.</p>
      )}
    </section>
  );
}
