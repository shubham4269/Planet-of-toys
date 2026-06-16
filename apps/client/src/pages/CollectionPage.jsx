// apps/client/src/pages/CollectionPage.jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import apiClient from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl, formatINR } from "@planet-of-toys/shared-web/format";
import { CollectionView } from "@planet-of-toys/shared-web";
import CatalogBrowse from "../components/CatalogBrowse.jsx";
import "./CollectionPage.css";

export default function CollectionPage() {
  const { slug } = useParams();
  const [meta, setMeta] = useState({ status: "loading", collection: null });

  useEffect(() => {
    let active = true;
    setMeta({ status: "loading", collection: null });
    apiClient.get(`/api/catalog/collections/${slug}`)
      .then((res) => { if (active) setMeta({ status: "ready", collection: res.collection }); })
      .catch((e) => { if (active) setMeta({ status: e?.status === 404 ? "notfound" : "error", collection: null }); });
    return () => { active = false; };
  }, [slug]);

  if (meta.status === "loading") return <p className="collection-page__status">Loading…</p>;
  if (meta.status === "notfound") return <p className="collection-page__status">Collection not found.</p>;
  if (meta.status === "error") return <p className="collection-page__status">Something went wrong.</p>;

  return (
    <main className="collection-page">
      <CollectionView collection={meta.collection} products={[]} resolveImageUrl={(f) => mediaUrl(f)} formatPrice={(n) => formatINR(n)} />
      <CatalogBrowse endpoint={`/api/catalog/collections/${slug}`} />
    </main>
  );
}
