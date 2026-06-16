// apps/client/src/components/CatalogBrowse.jsx
import { useEffect, useState } from "react";
import apiClient from "@planet-of-toys/shared-web/apiClient";
import { mediaUrl, formatINR } from "@planet-of-toys/shared-web/format";
import { FilterView, ProductGrid, SortControl } from "@planet-of-toys/shared-web";
import { toQueryString } from "@planet-of-toys/shared-web/catalog";
import "@planet-of-toys/shared-web/catalog/catalog-views.css";
import useFilterState from "../hooks/useFilterState.js";
import "./CatalogBrowse.css";

/**
 * Shared catalog browse region (filters + grid + sort + pagination), URL-driven.
 * `endpoint` is the catalog base path, e.g. "/api/catalog/collections/<slug>" or
 * "/api/catalog/categories/<slug>" — it fetches `${endpoint}/filters` and
 * `${endpoint}/products`. Used by both collection and category pages.
 */
export default function CatalogBrowse({ endpoint }) {
  const { selection, sort, page, setSelection, setSort, setPage } = useFilterState();
  const [filters, setFilters] = useState([]);
  const [result, setResult] = useState(null);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient.get(`${endpoint}/filters`).then((res) => { if (active) setFilters(res.filters || []); }).catch(() => { if (active) setFilters([]); });
    return () => { active = false; };
  }, [endpoint]);

  useEffect(() => {
    let active = true;
    const qs = toQueryString({ selection, sort, page });
    apiClient.get(`${endpoint}/products${qs ? `?${qs}` : ""}`)
      .then((res) => { if (active) setResult(res); })
      .catch(() => { if (active) setResult({ products: [], total: 0, page: 1, pageCount: 1 }); });
    return () => { active = false; };
  }, [endpoint, JSON.stringify(selection), sort, page]);

  const pageCount = result?.pageCount ?? 1;
  return (
    <div className="catalog-browse">
      <FilterView filters={filters} selection={selection} onChange={setSelection} open={drawer} onClose={() => setDrawer(false)} />
      <section className="catalog-browse__results">
        <div className="catalog-browse__toolbar">
          <button type="button" className="catalog-browse__filters-btn" onClick={() => setDrawer(true)}>Filters</button>
          <SortControl value={sort} onChange={setSort} />
        </div>
        <ProductGrid products={result?.products ?? []} resolveImageUrl={(f) => mediaUrl(f)} formatPrice={(n) => formatINR(n)} />
        {pageCount > 1 && (
          <nav className="catalog-browse__pager" aria-label="Pagination">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="catalog-browse__pageinfo">Page {page} of {pageCount}</span>
            <button type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next</button>
          </nav>
        )}
      </section>
    </div>
  );
}
