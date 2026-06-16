import { useCallback, useEffect, useRef, useState } from "react";

import apiClient, { API_BASE_URL, ApiError } from "@planet-of-toys/shared-web/apiClient";
import { getToken, notifyUnauthorized } from "../../lib/adminAuth.js";
import { formatINR, mediaUrl } from "@planet-of-toys/shared-web/format";
import TaxonomyAssignment from "./catalog/TaxonomyAssignment.jsx";
import "./ProductsPage.css";

/**
 * Admin product management page (Req 16).
 *
 * Provides the full catalog-maintenance surface for an authenticated
 * administrator against the admin product API:
 *   - List the catalog (`GET /api/admin/products`).
 *   - Create a product (`POST /api/admin/products`) and update it
 *     (`PUT /api/admin/products/:id`) with name, price, compare-at price,
 *     description, features, specifications, FAQ entries, and stock (Req 16.1).
 *     The unique slug is derived server-side from the name (Req 16.2).
 *   - Upload product images and video (`POST /api/admin/media`) and associate
 *     the stored media references with the product (Req 16.3).
 *   - Toggle active state and stock state
 *     (`PATCH /api/admin/products/:id/state`) (Req 16.4).
 *   - Delete a product (`DELETE /api/admin/products/:id`) (Req 16.5).
 *
 * Every call carries the admin bearer token (see adminAuth). A 401 clears the
 * session and signals the admin shell to redirect to login (Req 21.3).
 *
 * Requirements: 16.1, 16.3, 16.4, 16.5.
 */

/** An empty editor form (used for "create new"). */
function emptyForm() {
  return {
    id: null,
    name: "",
    price: "",
    compareAtPrice: "",
    description: "",
    features: "",
    stock: "",
    active: true,
    images: [],
    video: null,
    specifications: [],
    faqs: [],
    variants: [],
    categoryIds: [],
    collectionIds: [],
    attributeValueIds: [],
  };
}

/** Map a product document from the API into editor-form state. */
function formFromProduct(product) {
  return {
    id: product.id ?? product._id ?? null,
    name: product.name ?? "",
    price: product.price ?? "",
    compareAtPrice: product.compareAtPrice ?? "",
    description: product.description ?? "",
    features: Array.isArray(product.features)
      ? product.features.join("\n")
      : "",
    stock: product.stock ?? "",
    active: product.active !== false,
    images: Array.isArray(product.images) ? [...product.images] : [],
    video: product.video ?? null,
    specifications: Array.isArray(product.specifications)
      ? product.specifications.map((s) => ({ key: s.key, value: s.value }))
      : [],
    faqs: Array.isArray(product.faqs)
      ? product.faqs.map((f) => ({ question: f.question, answer: f.answer }))
      : [],
    variants: Array.isArray(product.variants)
      ? product.variants.map((v) => ({
          color: v.color ?? "",
          stock: v.stock ?? "",
          images: Array.isArray(v.images) ? [...v.images] : [],
        }))
      : [],
    categoryIds: Array.isArray(product.categoryIds) ? product.categoryIds.map(String) : [],
    collectionIds: Array.isArray(product.collectionIds) ? product.collectionIds.map(String) : [],
    attributeValueIds: Array.isArray(product.attributeValueIds) ? product.attributeValueIds.map(String) : [],
  };
}

/** Build the JSON payload sent to create/update from editor-form state. */
function payloadFromForm(form) {
  return {
    name: form.name.trim(),
    price: Number(form.price) || 0,
    compareAtPrice: Number(form.compareAtPrice) || 0,
    description: form.description,
    features: form.features
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    stock: Number(form.stock) || 0,
    active: Boolean(form.active),
    images: form.images,
    video: form.video || null,
    specifications: form.specifications
      .map((s) => ({ key: s.key.trim(), value: s.value.trim() }))
      .filter((s) => s.key && s.value),
    faqs: form.faqs
      .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
      .filter((f) => f.question && f.answer),
    variants: form.variants
      .map((v) => ({
        color: v.color.trim(),
        stock: Number(v.stock) || 0,
        images: v.images,
      }))
      .filter((v) => v.color),
    categoryIds: form.categoryIds ?? [],
    collectionIds: form.collectionIds ?? [],
    attributeValueIds: form.attributeValueIds ?? [],
  };
}

/** Total sellable stock: the sum of variant stocks when variants exist. */
function totalStock(product) {
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    return product.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
  }
  return Number(product.stock) || 0;
}

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [form, setForm] = useState(null); // null = editor closed
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);

  /** Translate an unauthorized error into a redirect-to-login signal. */
  const handleApiError = useCallback((err, fallback) => {
    if (err instanceof ApiError && err.status === 401) {
      notifyUnauthorized();
      return;
    }
    setError(
      (err instanceof ApiError && err.message) || fallback || "Request failed."
    );
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get("/api/admin/products", {
        token: getToken(),
      });
      setProducts(Array.isArray(res?.products) ? res.products : []);
    } catch (err) {
      handleApiError(err, "Unable to load products.");
    } finally {
      setLoading(false);
    }
  }, [handleApiError]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  function openCreate() {
    setNotice(null);
    setError(null);
    setForm(emptyForm());
  }

  function openEdit(product) {
    setNotice(null);
    setError(null);
    setForm(formFromProduct(product));
  }

  /** Copy the public product landing-page link to the clipboard. */
  async function copyCheckoutLink(product) {
    const origin =
      typeof window !== "undefined" && window.location
        ? window.location.origin
        : "";
    const url = `${origin}/p/${product.slug}`;
    try {
      await navigator.clipboard?.writeText(url);
      setCopiedId(product.id);
      setTimeout(
        () => setCopiedId((id) => (id === product.id ? null : id)),
        2000
      );
    } catch {
      // Clipboard may be unavailable (e.g. insecure context); surface the link.
      setNotice(`Product link: ${url}`);
    }
  }

  function closeEditor() {
    setForm(null);
    setSaving(false);
  }

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  // ---- Specifications (dynamic key/value rows) ----
  function addSpecification() {
    setForm((prev) => ({
      ...prev,
      specifications: [...prev.specifications, { key: "", value: "" }],
    }));
  }
  function updateSpecification(index, field, value) {
    setForm((prev) => ({
      ...prev,
      specifications: prev.specifications.map((row, i) =>
        i === index ? { ...row, [field]: value } : row
      ),
    }));
  }
  function removeSpecification(index) {
    setForm((prev) => ({
      ...prev,
      specifications: prev.specifications.filter((_, i) => i !== index),
    }));
  }

  // ---- FAQs (dynamic question/answer rows) ----
  function addFaq() {
    setForm((prev) => ({
      ...prev,
      faqs: [...prev.faqs, { question: "", answer: "" }],
    }));
  }
  function updateFaq(index, field, value) {
    setForm((prev) => ({
      ...prev,
      faqs: prev.faqs.map((row, i) =>
        i === index ? { ...row, [field]: value } : row
      ),
    }));
  }
  function removeFaq(index) {
    setForm((prev) => ({
      ...prev,
      faqs: prev.faqs.filter((_, i) => i !== index),
    }));
  }

  // ---- Color variants (dynamic color/stock/images rows) ----
  function addVariant() {
    setForm((prev) => ({
      ...prev,
      variants: [...prev.variants, { color: "", stock: "", images: [] }],
    }));
  }
  function updateVariant(index, field, value) {
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.map((row, i) =>
        i === index ? { ...row, [field]: value } : row
      ),
    }));
  }
  function removeVariant(index) {
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index),
    }));
  }
  async function handleVariantImageUpload(index, event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const refs = [];
      for (const file of files) {
        // Sequential upload keeps unique-filename generation race-free.
        // eslint-disable-next-line no-await-in-loop
        refs.push(await uploadMedia(file));
      }
      setForm((prev) => ({
        ...prev,
        variants: prev.variants.map((row, i) =>
          i === index ? { ...row, images: [...row.images, ...refs] } : row
        ),
      }));
    } catch (err) {
      handleApiError(err, "Image upload failed.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }
  function removeVariantImage(variantIndex, imageIndex) {
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.map((row, i) =>
        i === variantIndex
          ? { ...row, images: row.images.filter((_, j) => j !== imageIndex) }
          : row
      ),
    }));
  }

  /**
   * Upload a single file to the media endpoint and return the stored reference.
   * Uses a raw fetch (multipart/form-data) since apiClient is JSON-only.
   */
  async function uploadMedia(file) {
    const body = new FormData();
    body.append("file", file);
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}/api/admin/media`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      const message =
        (data && (data.error || data.message)) || "Upload failed.";
      throw new ApiError(message, { status: response.status, data });
    }
    // Prefer the bare filename so it resolves through mediaUrl() consistently.
    return data?.media?.filename || data?.media?.url;
  }

  async function handleImageUpload(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const refs = [];
      for (const file of files) {
        // Sequential upload keeps unique-filename generation race-free.
        // eslint-disable-next-line no-await-in-loop
        refs.push(await uploadMedia(file));
      }
      setForm((prev) => ({ ...prev, images: [...prev.images, ...refs] }));
    } catch (err) {
      handleApiError(err, "Image upload failed.");
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  function removeImage(index) {
    setForm((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  }

  async function handleVideoUpload(event) {
    const file = (event.target.files || [])[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const ref = await uploadMedia(file);
      setForm((prev) => ({ ...prev, video: ref }));
    } catch (err) {
      handleApiError(err, "Video upload failed.");
    } finally {
      setUploading(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  }

  function clearVideo() {
    setForm((prev) => ({ ...prev, video: null }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const payload = payloadFromForm(form);
    const token = getToken();
    try {
      if (form.id) {
        await apiClient.put(`/api/admin/products/${form.id}`, payload, {
          token,
        });
        setNotice("Product updated.");
      } else {
        await apiClient.post("/api/admin/products", payload, { token });
        setNotice("Product created.");
      }
      closeEditor();
      await loadProducts();
    } catch (err) {
      handleApiError(err, "Unable to save product.");
      setSaving(false);
    }
  }

  /** Toggle active or stock state via the dedicated state endpoint (Req 16.4). */
  async function toggleState(product, patch) {
    setError(null);
    try {
      const res = await apiClient.patch(
        `/api/admin/products/${product.id}/state`,
        patch,
        { token: getToken() }
      );
      const updated = res?.product;
      if (updated) {
        setProducts((prev) =>
          prev.map((p) => (p.id === updated.id ? updated : p))
        );
      } else {
        await loadProducts();
      }
    } catch (err) {
      handleApiError(err, "Unable to update product state.");
    }
  }

  function toggleActive(product) {
    toggleState(product, { active: !product.active });
  }

  function toggleStock(product) {
    // A simple in/out-of-stock toggle: restock to 1 or clear to 0 (Req 16.4).
    toggleState(product, { stock: Number(product.stock) > 0 ? 0 : 1 });
  }

  async function handleDelete(product) {
    const ok = globalThis.confirm?.(
      `Delete "${product.name}"? This cannot be undone.`
    );
    if (ok === false) return;
    setError(null);
    try {
      await apiClient.delete(`/api/admin/products/${product.id}`, {
        token: getToken(),
      });
      setNotice("Product deleted.");
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
    } catch (err) {
      handleApiError(err, "Unable to delete product.");
    }
  }

  return (
    <section className="admin-products">
      <header className="admin-products__head">
        <div>
          <h1 className="admin-products__title">Products</h1>
          <p className="admin-products__subtitle">
            Create, edit, and manage the storefront catalog.
          </p>
        </div>
        <button
          type="button"
          className="admin-products__primary"
          onClick={openCreate}
        >
          New product
        </button>
      </header>

      {error ? (
        <p className="admin-products__error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="admin-products__notice" role="status">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <p className="admin-products__muted">Loading products…</p>
      ) : products.length === 0 ? (
        <p className="admin-products__muted">
          No products yet. Create your first product to get started.
        </p>
      ) : (
        <div className="admin-products__table-wrap">
          <table className="admin-products__table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Price</th>
                <th scope="col">Stock</th>
                <th scope="col">Active</th>
                <th scope="col" className="admin-products__actions-col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <span className="admin-products__name">{product.name}</span>
                    <span className="admin-products__slug-row">
                      <span className="admin-products__slug">/{product.slug}</span>
                      <button
                        type="button"
                        className="admin-products__copy"
                        onClick={() => copyCheckoutLink(product)}
                        title="Copy product link"
                      >
                        {copiedId === product.id ? "Copied!" : "Copy link"}
                      </button>
                    </span>
                  </td>
                  <td>{formatINR(product.price)}</td>
                  <td>
                    {Array.isArray(product.variants) &&
                    product.variants.length > 0 ? (
                      // Variant products: per-color stock is managed in the
                      // editor, so show the total instead of a blunt toggle.
                      <span
                        className={`admin-products__badge admin-products__badge--${
                          totalStock(product) > 0 ? "in" : "out"
                        }`}
                        title="Stock is managed per color in the editor"
                      >
                        {totalStock(product) > 0
                          ? `In stock (${totalStock(product)} across ${product.variants.length} colors)`
                          : "Out of stock"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={`admin-products__badge admin-products__badge--${
                          Number(product.stock) > 0 ? "in" : "out"
                        }`}
                        onClick={() => toggleStock(product)}
                        title="Toggle stock state"
                      >
                        {Number(product.stock) > 0
                          ? `In stock (${product.stock})`
                          : "Out of stock"}
                      </button>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`admin-products__badge admin-products__badge--${
                        product.active ? "in" : "out"
                      }`}
                      onClick={() => toggleActive(product)}
                      title="Toggle active state"
                    >
                      {product.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="admin-products__actions-col">
                    <button
                      type="button"
                      className="admin-products__link"
                      onClick={() => openEdit(product)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="admin-products__link admin-products__link--danger"
                      onClick={() => handleDelete(product)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form ? (
        <div className="admin-products__editor">
          <form className="admin-products__card" onSubmit={handleSubmit}>
            <div className="admin-products__card-head">
              <h2 className="admin-products__card-title">
                {form.id ? "Edit product" : "New product"}
              </h2>
              <button
                type="button"
                className="admin-products__link"
                onClick={closeEditor}
              >
                Close
              </button>
            </div>

            <div className="admin-products__grid">
              <label className="admin-products__field">
                <span className="admin-products__label">Name</span>
                <input
                  className="admin-products__input"
                  type="text"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  required
                />
              </label>

              <label className="admin-products__field">
                <span className="admin-products__label">Price (₹)</span>
                <input
                  className="admin-products__input"
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={(e) => updateField("price", e.target.value)}
                  required
                />
              </label>

              <label className="admin-products__field">
                <span className="admin-products__label">Compare-at price (₹)</span>
                <input
                  className="admin-products__input"
                  type="number"
                  min="0"
                  value={form.compareAtPrice}
                  onChange={(e) =>
                    updateField("compareAtPrice", e.target.value)
                  }
                />
              </label>

              <label className="admin-products__field">
                <span className="admin-products__label">Stock</span>
                <input
                  className="admin-products__input"
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={(e) => updateField("stock", e.target.value)}
                />
              </label>
            </div>

            <label className="admin-products__field">
              <span className="admin-products__label">Description</span>
              <textarea
                className="admin-products__textarea"
                rows={3}
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
              />
            </label>

            <label className="admin-products__field">
              <span className="admin-products__label">
                Features (one per line)
              </span>
              <textarea
                className="admin-products__textarea"
                rows={3}
                value={form.features}
                onChange={(e) => updateField("features", e.target.value)}
              />
            </label>

            <label className="admin-products__check">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => updateField("active", e.target.checked)}
              />
              <span>Active (visible on the storefront)</span>
            </label>

            {/* ---- Specifications ---- */}
            <fieldset className="admin-products__fieldset">
              <legend className="admin-products__legend">Specifications</legend>
              {form.specifications.map((row, index) => (
                <div className="admin-products__row" key={`spec-${index}`}>
                  <input
                    className="admin-products__input"
                    type="text"
                    placeholder="Key"
                    value={row.key}
                    onChange={(e) =>
                      updateSpecification(index, "key", e.target.value)
                    }
                  />
                  <input
                    className="admin-products__input"
                    type="text"
                    placeholder="Value"
                    value={row.value}
                    onChange={(e) =>
                      updateSpecification(index, "value", e.target.value)
                    }
                  />
                  <button
                    type="button"
                    className="admin-products__link admin-products__link--danger"
                    onClick={() => removeSpecification(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="admin-products__ghost"
                onClick={addSpecification}
              >
                Add specification
              </button>
            </fieldset>

            {/* ---- FAQs ---- */}
            <fieldset className="admin-products__fieldset">
              <legend className="admin-products__legend">FAQ entries</legend>
              {form.faqs.map((row, index) => (
                <div className="admin-products__row" key={`faq-${index}`}>
                  <input
                    className="admin-products__input"
                    type="text"
                    placeholder="Question"
                    value={row.question}
                    onChange={(e) => updateFaq(index, "question", e.target.value)}
                  />
                  <input
                    className="admin-products__input"
                    type="text"
                    placeholder="Answer"
                    value={row.answer}
                    onChange={(e) => updateFaq(index, "answer", e.target.value)}
                  />
                  <button
                    type="button"
                    className="admin-products__link admin-products__link--danger"
                    onClick={() => removeFaq(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="admin-products__ghost"
                onClick={addFaq}
              >
                Add FAQ
              </button>
            </fieldset>

            {/* ---- Color variants ---- */}
            <fieldset className="admin-products__fieldset">
              <legend className="admin-products__legend">
                Color variants (optional)
              </legend>
              <p className="admin-products__muted">
                Each color has its own stock and images. Leave empty for a
                single-color product.
              </p>
              {form.variants.map((variant, index) => (
                <div
                  className="admin-products__variant"
                  key={`variant-${index}`}
                  data-testid={`variant-row-${index}`}
                >
                  <div className="admin-products__row">
                    <input
                      className="admin-products__input"
                      type="text"
                      placeholder="Color name (e.g. Red)"
                      value={variant.color}
                      aria-label={`Variant ${index + 1} color`}
                      onChange={(e) =>
                        updateVariant(index, "color", e.target.value)
                      }
                    />
                    <input
                      className="admin-products__input"
                      type="number"
                      min="0"
                      placeholder="Stock"
                      value={variant.stock}
                      aria-label={`Variant ${index + 1} stock`}
                      onChange={(e) =>
                        updateVariant(index, "stock", e.target.value)
                      }
                    />
                    <button
                      type="button"
                      className="admin-products__link admin-products__link--danger"
                      onClick={() => removeVariant(index)}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="admin-products__thumbs">
                    {variant.images.map((ref, imageIndex) => (
                      <div
                        className="admin-products__thumb"
                        key={`variant-${index}-img-${imageIndex}`}
                      >
                        <img
                          src={mediaUrl(ref)}
                          alt={`${variant.color || "Variant"} image ${imageIndex + 1}`}
                        />
                        <button
                          type="button"
                          className="admin-products__thumb-remove"
                          onClick={() => removeVariantImage(index, imageIndex)}
                          aria-label={`Remove ${variant.color || "variant"} image ${imageIndex + 1}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    aria-label={`Upload images for variant ${index + 1}`}
                    onChange={(e) => handleVariantImageUpload(index, e)}
                    disabled={uploading}
                  />
                </div>
              ))}
              <button
                type="button"
                className="admin-products__ghost"
                onClick={addVariant}
              >
                Add color variant
              </button>
            </fieldset>

            {/* ---- Media ---- */}
            <fieldset className="admin-products__fieldset">
              <legend className="admin-products__legend">Media</legend>

              <div className="admin-products__field">
                <span className="admin-products__label">Images</span>
                <div className="admin-products__thumbs">
                  {form.images.map((ref, index) => (
                    <div className="admin-products__thumb" key={`img-${index}`}>
                      <img src={mediaUrl(ref)} alt={`Product image ${index + 1}`} />
                      <button
                        type="button"
                        className="admin-products__thumb-remove"
                        onClick={() => removeImage(index)}
                        aria-label={`Remove image ${index + 1}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  disabled={uploading}
                />
              </div>

              <div className="admin-products__field">
                <span className="admin-products__label">Video</span>
                {form.video ? (
                  <div className="admin-products__video-row">
                    <span className="admin-products__muted">{form.video}</span>
                    <button
                      type="button"
                      className="admin-products__link admin-products__link--danger"
                      onClick={clearVideo}
                    >
                      Remove video
                    </button>
                  </div>
                ) : null}
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleVideoUpload}
                  disabled={uploading}
                />
              </div>

              {uploading ? (
                <p className="admin-products__muted">Uploading…</p>
              ) : null}
            </fieldset>

            {/* ---- Catalog taxonomy: categories, collections, attribute values ---- */}
            <fieldset className="admin-products__fieldset">
              <legend className="admin-products__legend">Catalog</legend>
              <TaxonomyAssignment
                value={{
                  categoryIds: form.categoryIds,
                  collectionIds: form.collectionIds,
                  attributeValueIds: form.attributeValueIds,
                }}
                onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
              />
            </fieldset>

            <div className="admin-products__card-foot">
              <button
                type="button"
                className="admin-products__ghost"
                onClick={closeEditor}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="admin-products__primary"
                disabled={saving || uploading}
              >
                {saving ? "Saving…" : form.id ? "Save changes" : "Create product"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
