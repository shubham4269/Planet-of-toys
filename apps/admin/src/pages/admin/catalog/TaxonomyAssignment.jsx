// apps/admin/src/pages/admin/catalog/TaxonomyAssignment.jsx
import { useEffect, useState } from "react";
import apiClient, { ApiError } from "@planet-of-toys/shared-web/apiClient";
import { getToken, notifyUnauthorized } from "../../../lib/adminAuth.js";

/** Flatten a category tree into [{id, name}] (indented by depth). */
function flattenCats(nodes, depth = 0, out = []) {
  for (const n of nodes) {
    out.push({ id: n.id, name: `${"— ".repeat(depth)}${n.name}` });
    if (n.children?.length) flattenCats(n.children, depth + 1, out);
  }
  return out;
}

/**
 * Controlled taxonomy picker for the product editor. `value` is
 * { categoryIds, collectionIds, attributeValueIds }; `onChange` receives the next
 * value whenever a checkbox toggles. Fetches catalog options on mount.
 */
export default function TaxonomyAssignment({ value, onChange }) {
  const [cats, setCats] = useState([]);
  const [cols, setCols] = useState([]);
  const [attrs, setAttrs] = useState([]);
  const auth = () => ({ token: getToken() });

  useEffect(() => {
    (async () => {
      try {
        const [c, k, a] = await Promise.all([
          apiClient.get("/api/admin/catalog/categories", auth()),
          apiClient.get("/api/admin/catalog/collections", auth()),
          apiClient.get("/api/admin/catalog/attributes", auth()),
        ]);
        setCats(flattenCats(c?.categories ?? []));
        setCols((k?.collections ?? []).map((x) => ({ id: x.id, name: x.name })));
        setAttrs(a?.attributes ?? []);
      } catch (e) { if (e instanceof ApiError && e.status === 401) notifyUnauthorized(); }
    })();
  }, []);

  const toggle = (field, id) => {
    const set = new Set(value[field] ?? []);
    if (set.has(id)) set.delete(id); else set.add(id);
    onChange({ ...value, [field]: Array.from(set) });
  };

  const box = (field, id, name) => (
    <label key={id} className="taxonomy__opt">
      <input type="checkbox" checked={(value[field] ?? []).includes(id)} onChange={() => toggle(field, id)} /> {name}
    </label>
  );

  return (
    <div className="taxonomy">
      <fieldset className="taxonomy__group"><legend>Categories</legend>{cats.map((c) => box("categoryIds", c.id, c.name))}</fieldset>
      <fieldset className="taxonomy__group"><legend>Collections</legend>{cols.map((c) => box("collectionIds", c.id, c.name))}</fieldset>
      <fieldset className="taxonomy__group"><legend>Attributes</legend>
        {attrs.map((a) => (
          <div key={a.id} className="taxonomy__attr"><span className="taxonomy__attr-name">{a.name}</span>
            {(a.values ?? []).map((v) => box("attributeValueIds", v.id, v.name))}</div>
        ))}
      </fieldset>
    </div>
  );
}
