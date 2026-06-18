import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

import { createAdminProductHandlers } from "./product.controller.js";
import { directAuditRecorder } from "../auth/audit.service.js";
import { Product, AuditLog } from "../../models/index.js";

/**
 * Verifies the admin product write handlers record an Audit_Log entry for each
 * successful create/update/delete (Req 26.2), capturing the action, the acting
 * administrator, and a timestamp, and that auditing never leaks into the
 * response (Req 26.5) nor breaks the operation when the recorder fails.
 */
describe("admin product handlers - audit integration (Req 26.2, 26.5)", () => {
  let mongod;
  const adminId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  }, 60000);

  afterEach(async () => {
    await Product.deleteMany({});
    await AuditLog.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  function mockRes() {
    return {
      statusCode: 200,
      body: undefined,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
      end() {
        this.ended = true;
        return this;
      },
    };
  }

  function reqWith(body = {}, params = {}) {
    return { body, params, admin: { id: adminId } };
  }

  it("records an audit entry on product create and excludes audit data from the response", async () => {
    const handlers = createAdminProductHandlers({ recordAudit: directAuditRecorder() });
    const res = mockRes();

    await handlers.createProduct(reqWith({ name: "Audited Toy", price: 100, stock: 1 }), res, (e) => {
      throw e;
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.product.name).toBe("Audited Toy");
    // No audit data leaks into the customer/admin response payload (Req 26.5).
    expect(res.body).not.toHaveProperty("audit");

    const entries = await AuditLog.find({}).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("product.create");
    expect(String(entries[0].adminId)).toBe(String(adminId));
    expect(entries[0].targetType).toBe("Product");
    expect(entries[0].timestamp).toBeInstanceOf(Date);
  });

  it("records an audit entry on product update", async () => {
    const handlers = createAdminProductHandlers({ recordAudit: directAuditRecorder() });
    const created = await Product.create({ name: "Before", slug: "before", price: 10, stock: 1 });

    const res = mockRes();
    await handlers.updateProduct(reqWith({ price: 20 }, { id: String(created._id) }), res, (e) => {
      throw e;
    });

    const entries = await AuditLog.find({}).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("product.update");
    expect(entries[0].targetId).toBe(String(created._id));
  });

  it("records an audit entry on product delete", async () => {
    const handlers = createAdminProductHandlers({ recordAudit: directAuditRecorder() });
    const created = await Product.create({ name: "Doomed", slug: "doomed", price: 10, stock: 1 });

    const res = mockRes();
    await handlers.deleteProduct(reqWith({}, { id: String(created._id) }), res, (e) => {
      throw e;
    });

    expect(res.ended).toBe(true);
    const entries = await AuditLog.find({}).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("product.delete");
  });

  it("still completes the product operation when the audit recorder throws", async () => {
    const recordAudit = vi.fn().mockRejectedValue(new Error("audit down"));
    const handlers = createAdminProductHandlers({ recordAudit });
    const res = mockRes();

    await handlers.createProduct(reqWith({ name: "Resilient", price: 5, stock: 1 }), res, (e) => {
      throw e;
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.product.name).toBe("Resilient");
    expect(recordAudit).toHaveBeenCalledTimes(1);
  });

  it("does not record an audit entry when no recorder is injected", async () => {
    const handlers = createAdminProductHandlers();
    const res = mockRes();

    await handlers.createProduct(reqWith({ name: "Silent", price: 5, stock: 1 }), res, (e) => {
      throw e;
    });

    expect(res.statusCode).toBe(201);
    const entries = await AuditLog.find({}).lean();
    expect(entries).toHaveLength(0);
  });
});
