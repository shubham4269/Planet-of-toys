import * as productService from "../services/product.service.js";
import { toPublicProjection } from "../services/product.service.js";
import { AppError } from "../middleware/errorHandler.js";
import { AUDIT_ACTIONS } from "../services/audit.service.js";

/**
 * Product controllers (Req 1, 16, 26.2).
 *
 * Controllers translate HTTP requests into Product_Service calls and shape
 * sanitized responses. Admin handlers return the full product document (admin
 * surface), while the public storefront handler returns only the public
 * projection with internal fields removed (Req 1.6, 19.1). All errors are
 * forwarded to the central error handler via `next` so no internal detail
 * leaks to the client (Req 27).
 *
 * Admin create/update/delete handlers record an Audit_Log entry for each
 * successful action via an injected `recordAudit` recorder (Req 26.2). Auditing
 * is best-effort: a recorder failure is swallowed so it never breaks the
 * product operation, and audit data is never echoed in the response (Req 26.5).
 */

/**
 * Resolve the acting administrator id from the request. The JWT auth guard sets
 * `req.admin` / `req.adminId`; fall back to `null` when neither is present.
 *
 * @param {import("express").Request} req
 * @returns {unknown}
 */
function adminIdFrom(req) {
  return req.admin?.id ?? req.admin?._id ?? req.adminId ?? null;
}

/**
 * Best-effort audit emission for an admin product action. Never throws — an
 * audit failure must not affect the product operation or its response.
 *
 * @param {((entry: object) => unknown)|undefined} recordAudit
 * @param {import("express").Request} req
 * @param {object} entry partial audit entry (action/target)
 */
async function emitAudit(recordAudit, req, entry) {
  if (typeof recordAudit !== "function") return;
  try {
    await recordAudit({ adminId: adminIdFrom(req), ...entry });
  } catch {
    // Audit failures are intentionally swallowed (Req 26 best-effort).
  }
}

/**
 * GET /api/products/:slug — public storefront resolver.
 * Returns the active-product projection, or 404 when the slug does not resolve
 * to an active product (Req 1.6).
 */
export async function getProductBySlug(req, res, next) {
  try {
    const projection = await productService.getActiveProductBySlug(
      req.params.slug
    );
    if (!projection) {
      throw new AppError(
        `Product not found for slug: ${req.params.slug}`,
        404,
        { clientMessage: "Product not found." }
      );
    }
    res.json({ product: projection });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/products — list catalog (admin). */
export async function listProducts(req, res, next) {
  try {
    const products = await productService.listProducts();
    res.json({ products: products.map((p) => p.toJSON()) });
  } catch (err) {
    next(err);
  }
}

/**
 * Build the admin product write handlers (create/update/state/delete) bound to
 * an optional audit recorder (Req 16, 26.2).
 *
 * @param {object} [options]
 * @param {(entry: object) => unknown} [options.recordAudit]
 *   recorder invoked with a fully-formed audit entry after a successful write.
 * @returns {{ createProduct: Function, updateProduct: Function,
 *   setProductState: Function, deleteProduct: Function }}
 */
export function createAdminProductHandlers({ recordAudit } = {}) {
  /** POST /api/admin/products — create (admin). */
  async function createProduct(req, res, next) {
    try {
      const product = await productService.createProduct(req.body);
      await emitAudit(recordAudit, req, {
        action: AUDIT_ACTIONS.PRODUCT_CREATE,
        targetType: "Product",
        targetId: product.id ?? product._id,
      });
      res.status(201).json({ product: product.toJSON() });
    } catch (err) {
      next(err);
    }
  }

  /** PUT /api/admin/products/:id — update (admin). */
  async function updateProduct(req, res, next) {
    try {
      const product = await productService.updateProduct(req.params.id, req.body);
      await emitAudit(recordAudit, req, {
        action: AUDIT_ACTIONS.PRODUCT_UPDATE,
        targetType: "Product",
        targetId: product.id ?? product._id,
      });
      res.json({ product: product.toJSON() });
    } catch (err) {
      next(err);
    }
  }

  /** PATCH /api/admin/products/:id/state — toggle active/stock (admin). */
  async function setProductState(req, res, next) {
    try {
      const { active, stock } = req.body ?? {};
      const product = await productService.setProductState(req.params.id, {
        active,
        stock,
      });
      await emitAudit(recordAudit, req, {
        action: AUDIT_ACTIONS.PRODUCT_UPDATE,
        targetType: "Product",
        targetId: product.id ?? product._id,
        metadata: { state: true },
      });
      res.json({ product: product.toJSON() });
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/admin/products/:id — delete (admin). */
  async function deleteProduct(req, res, next) {
    try {
      await productService.deleteProduct(req.params.id);
      await emitAudit(recordAudit, req, {
        action: AUDIT_ACTIONS.PRODUCT_DELETE,
        targetType: "Product",
        targetId: req.params.id,
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }

  return { createProduct, updateProduct, setProductState, deleteProduct };
}

// Backward-compatible standalone handlers (no audit recorder). The admin router
// builds audit-aware handlers via createAdminProductHandlers when a recorder is
// injected at wiring time.
const defaultAdminHandlers = createAdminProductHandlers();

/** POST /api/admin/products — create (admin). */
export const createProduct = defaultAdminHandlers.createProduct;
/** PUT /api/admin/products/:id — update (admin). */
export const updateProduct = defaultAdminHandlers.updateProduct;
/** PATCH /api/admin/products/:id/state — toggle active/stock (admin). */
export const setProductState = defaultAdminHandlers.setProductState;
/** DELETE /api/admin/products/:id — delete (admin). */
export const deleteProduct = defaultAdminHandlers.deleteProduct;

export default {
  getProductBySlug,
  listProducts,
  createAdminProductHandlers,
  createProduct,
  updateProduct,
  setProductState,
  deleteProduct,
};

export { toPublicProjection };
