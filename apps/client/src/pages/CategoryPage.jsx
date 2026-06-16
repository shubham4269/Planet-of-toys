// apps/client/src/pages/CategoryPage.jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import apiClient from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl, formatINR } from "@planet-of-toys/shared-web/format";
import { CollectionView } from "@planet-of-toys/shared-web";
import CatalogBrowse from "../components/CatalogBrowse.jsx";
import "./CollectionPage.css";

/**
 * Category browse page — first-class like a collection page. The category's
 * name/heroTitle/heroSubtitle/heroImage feed the shared CollectionView hero; the
 * shared CatalogBrowse drives filters + grid + sort + pagination.
 */
export default function CategoryPage() {
  const { slug } = useParams();
  const [meta, setMeta] = useState({ status: "loading", category: null });

  useEffect(() => {
    let active = true;
    setMeta({ status: "loading", category: null });
    apiClient.get(`/api/catalog/categories/${slug}`)
      .then((res) => { if (active) setMeta({ status: "ready", category: res.category }); })
      .catch((e) => { if (active) setMeta({ status: e?.status === 404 ? "notfound" : "error", category: null }); });
    return () => { active = false; };
  }, [slug]);

  if (meta.status === "loading") return <p className="collection-page__status">Loading…</p>;
  if (meta.status === "notfound") return <p className="collection-page__status">Category not found.</p>;
  if (meta.status === "error") return <p className="collection-page__status">Something went wrong.</p>;

  return (
    <main className="collection-page">
      <CollectionView collection={meta.category} products={[]} resolveImageUrl={(f) => mediaUrl(f)} formatPrice={(n) => formatINR(n)} />
      <CatalogBrowse endpoint={`/api/catalog/categories/${slug}`} />
    </main>
  );
}
