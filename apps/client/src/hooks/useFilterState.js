// apps/client/src/hooks/useFilterState.js
import { useSearchParams } from "react-router-dom";
import { parseFilterParams, toQueryString } from "@planet-of-toys/shared-web/catalog";

/**
 * URL-driven filter/sort/page state for the collection browse page. The query
 * string is the single source of truth (shareable, back/forward-safe). Changing
 * the selection or sort resets to page 1.
 */
export default function useFilterState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { selection, sort, page } = parseFilterParams(searchParams);
  const commit = (next) => setSearchParams(toQueryString(next));
  return {
    selection, sort, page,
    setSelection: (selectionNext) => commit({ selection: selectionNext, sort, page: 1 }),
    setSort: (sortNext) => commit({ selection, sort: sortNext, page: 1 }),
    setPage: (pageNext) => commit({ selection, sort, page: pageNext }),
  };
}
