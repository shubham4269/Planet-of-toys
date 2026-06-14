import { Router } from "express";
import mongoose from "mongoose";

import { loginLimiter as defaultLoginLimiter } from "../middleware/rateLimiters.js";
import { createLoginBruteForce } from "../middleware/loginBruteForce.js";
import { createLoginHandler } from "../controllers/auth.controller.js";
import { requireAuth as defaultRequireAuth } from "../middleware/requireAuth.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  getDashboardStats as defaultGetDashboardStats,
  listOrders as defaultListOrders,
  getOrderDetail as defaultGetOrderDetail,
  cancelOrder as defaultCancelOrder,
} from "../services/order.service.js";
import { createShipment as defaultCreateShipment } from "../services/shipping.service.js";
import { directAuditRecorder, AUDIT_ACTIONS } from "../services/audit.service.js";
import { Order } from "../models/index.js";
import * as productController from "../controllers/product.controller.js";

/**
 * Admin router (Req 11.8, 14, 15, 16, 17, 25, 26).
 *
 * Mounted at `/api/admin`. Exposes:
 *
 *   POST /login                   -> { token } | 401 (rate-limited, brute-force)
 *   GET  /dashboard               -> dashboard statistics (authenticated)
 *   GET  /orders                  -> paginated order list (authenticated)
 *   GET  /orders/:id              -> order detail (authenticated)
 *   POST /orders/:id/cancel       -> cancel order (authenticated, audited)
 *   POST /orders/:id/fulfill      -> manual courier/AWB for PENDING (auth, audited)
 *   GET  /products                -> admin product list (authenticated)
 *   POST /products                -> create product (authenticated, audited)
 *   PUT  /products/:id            -> update product (authenticated, audited)
 *   PATCH /products/:id/state     -> toggle product state (authenticated, audited)
 *   DELETE /products/:id          -> delete product (authenticated, audited)
 *
 * Auditable administrator actions are recorded server-side via an injected
 * direct audit recorder (Req 26). Login records a successful-login audit entry
 * through the per-request `recordAudit` factory consumed by the login handler.
 *
 * @param {object} [options]
 */
export function createAuthRouter({
  loginLimiter = defaultLoginLimiter,
  bruteForce = createLoginBruteForce(),
  Admin,
  verifyPassword,
  issueToken,
  recordAudit,
  auditRecorder = directAuditRecorder(),
  requireAuth = defaultRequireAuth,
  getDashboardStats = defaultGetDashboardStats,
  listOrders = defaultListOrders,
  getOrderDetail = defaultGetOrderDetail,
  cancelOrder = defaultCancelOrder,
  createShipmentFn = defaultCreateShipment,
  orderModel = Order,
  env,
} = {}) {
  const router = Router();

  // Populate `req.adminId` from the verified JWT subject so downstream handlers
  // and audit entries can attribute the acting administrator. Runs only after
  // `requireAuth` has attached `req.admin`.
  function attachAdminId(req, _res, next) {
    req.adminId = req.admin?.sub ?? req.admin?.id ?? req.admin?._id;
    next();
  }
  const authed = [requireAuth, attachAdminId];

  // --- Login (public) ---
  const loginHandler = createLoginHandler({
    Admin,
    verifyPassword,
    issueToken,
    bruteForce,
    recordAudit,
    env,
  });
  router.post("/login", loginLimiter, bruteForce.guard, loginHandler);

  // --- Dashboard (authenticated, Req 15.1) ---
  router.get("/dashboard", ...authed, async (req, res, next) => {
    try {
      const stats = await getDashboardStats();
      res.json(stats);
    } catch (err) {
      next(err);
    }
  });

  // --- Orders (authenticated, Req 17) ---
  router.get("/orders", ...authed, async (req, res, next) => {
    try {
      const { status, search, page, pageSize } = req.query;
      const filter = {};
      if (status) filter.orderStatus = status;
      const result = await listOrders({ filter, search, page, pageSize });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get("/orders/:id", ...authed, async (req, res, next) => {
    try {
      const order = await getOrderDetail(req.params.id);
      res.json({ order });
    } catch (err) {
      next(err);
    }
  });

  router.post("/orders/:id/cancel", ...authed, async (req, res, next) => {
    try {
      const order = await cancelOrder(req.params.id, {
        adminId: req.adminId,
        recordAudit: auditRecorder,
      });
      // Return the same admin-detail projection the detail view consumes so
      // the open modal can refresh in place.
      const detail = await getOrderDetail(order.orderId);

      // A shipment reference that is not CANCELLED after a successful
      // cancellation means the automatic Shiprocket cancellation failed — the
      // admin must call off the pickup manually.
      const hasShipmentRefs = Boolean(
        detail.shipment?.shiprocketOrderId || detail.shipment?.awb
      );
      const needsManualShiprocket =
        hasShipmentRefs && detail.shipmentStatus !== "CANCELLED";
      const warning = needsManualShiprocket
        ? detail.payment?.status === "REFUNDED"
          ? "Refund completed successfully. However, the Shiprocket shipment could not be cancelled automatically. Please cancel it manually from the Shiprocket dashboard."
          : "The Shiprocket shipment could not be cancelled automatically. Please cancel it manually from the Shiprocket dashboard."
        : null;

      res.json({ order: detail, ...(warning ? { warning } : {}) });
    } catch (err) {
      next(err);
    }
  });

  // Manual Shiprocket courier-assignment + AWB generation for an order whose
  // Shipment_Status is PENDING (Req 11.8, 17.4). The shipping service never
  // throws: on success the order moves to CREATED, otherwise it stays PENDING.
  router.post("/orders/:id/fulfill", ...authed, async (req, res, next) => {
    try {
      const { id } = req.params;
      let order = await orderModel.findOne({ orderId: id });
      if (!order && mongoose.isValidObjectId(id)) {
        order = await orderModel.findById(id);
      }
      if (!order) {
        throw new AppError(`Order not found: ${id}`, 404, {
          clientMessage: "That order could not be found.",
        });
      }

      const result = await createShipmentFn(order);

      // Record the manual shipment-retry as an auditable action (Req 26.4).
      try {
        await auditRecorder({
          action: AUDIT_ACTIONS.SHIPMENT_RETRY,
          adminId: req.adminId,
          targetType: "Order",
          targetId: order.orderId,
          metadata: { shipmentStatus: result?.shipmentStatus },
        });
      } catch {
        // Auditing is best-effort and never blocks the operation.
      }

      const detail = await getOrderDetail(order.orderId);
      res.json({
        order: detail,
        shipment: {
          ok: Boolean(result?.ok),
          shipmentStatus: result?.shipmentStatus,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // --- Products (authenticated, Req 16, 26.2) ---
  const productHandlers = productController.createAdminProductHandlers({
    recordAudit: auditRecorder,
  });

  router.get("/products", ...authed, productController.listProducts);
  router.post("/products", ...authed, productHandlers.createProduct);
  router.put("/products/:id", ...authed, productHandlers.updateProduct);
  router.patch("/products/:id/state", ...authed, productHandlers.setProductState);
  router.delete("/products/:id", ...authed, productHandlers.deleteProduct);

  return router;
}

export default createAuthRouter;
