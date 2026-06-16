// apps/client/src/pages/CollectionPage.jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import apiClient from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl, formatINR } from "@planet-of-toys/shared-web/format";
import { CollectionView } from "@planet-of-toys/shared-web";
import "@planet-of-toys/shared-web/catalog/catalog-views.css";

/**
 * Storefront collection page — the Sub-project A proof. Fetches the public
 * collection by slug and renders it via the SAME shared CollectionView used in the
 * admin live preview. Product grid + working filters arrive in Sub-project B.
 */
export default function CollectionPage() {
  const { slug } = useParams();
  const [state, setState] = useState({ status: "loading", collection: null, products: [] });

  useEffect(() => {
    let active = true;
    setState({ status: "loading", collection: null, products: [] });
    apiClient.get(`/api/catalog/collections/${slug}`)
      .then((res) => { if (active) setState({ status: "ready", collection: res.collection, products: res.products ?? [] }); })
      .catch((e) => { if (active) setState({ status: e?.status === 404 ? "notfound" : "error", collection: null, products: [] }); });
    return () => { active = false; };
  }, [slug]);

  if (state.status === "loading") return <p className="collection-page__status">Loading…</p>;
  if (state.status === "notfound") return <p className="collection-page__status">Collection not found.</p>;
  if (state.status === "error") return <p className="collection-page__status">Something went wrong.</p>;

  return (
    <main className="collection-page">
      <CollectionView
        collection={state.collection}
        products={state.products}
        resolveImageUrl={(f) => mediaUrl(f)}
        formatPrice={(n) => formatINR(n)}
      />
    </main>
  );
}
