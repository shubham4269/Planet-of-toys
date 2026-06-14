import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

import {
  recordAudit,
  loginAuditRecorder,
  requestAuditRecorder,
  directAuditRecorder,
  AUDIT_ACTIONS,
  AuditError,
} from "./audit.service.js";
import { AuditLog } from "../models/index.js";

describe("audit service (Req 26.1-26.5, 30.12)", () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  }, 60000);

  afterEach(async () => {
    await AuditLog.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) {
      await mongod.stop();
    }
  });

  describe("recordAudit", () => {
    it("persists an entry with action, acting admin, and timestamp", async () => {
      const adminId = new mongoose.Types.ObjectId();
      const before = Date.now();

      const entry = await recordAudit({
        action: AUDIT_ACTIONS.PRODUCT_CREATE,
        adminId,
        targetType: "Product",
        targetId: "abc123",
      });

      expect(entry.action).toBe("product.create");
      expect(String(entry.adminId)).toBe(String(adminId));
      expect(entry.targetType).toBe("Product");
      expect(entry.targetId).toBe("abc123");
      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(before - 1000);

      const persisted = await AuditLog.findById(entry._id).lean();
      expect(persisted).not.toBeNull();
      expect(persisted.action).toBe("product.create");
    });

    it("defaults the timestamp to now when none is provided", async () => {
      const adminId = new mongoose.Types.ObjectId();
      const entry = await recordAudit({ action: AUDIT_ACTIONS.ORDER_CANCEL, adminId });
      expect(entry.timestamp).toBeInstanceOf(Date);
    });

    it("honors an explicitly provided timestamp", async () => {
      const adminId = new mongoose.Types.ObjectId();
      const ts = new Date("2023-01-02T03:04:05.000Z");
      const entry = await recordAudit({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        adminId,
        timestamp: ts,
      });
      expect(entry.timestamp.toISOString()).toBe(ts.toISOString());
    });

    it("extracts the admin id from an admin object when adminId is absent", async () => {
      const adminId = new mongoose.Types.ObjectId();
      const entry = await recordAudit({
        action: AUDIT_ACTIONS.ADMIN_LOGIN,
        admin: { id: adminId, email: "admin@example.com" },
      });
      expect(String(entry.adminId)).toBe(String(adminId));
    });

    it("stringifies the target id", async () => {
      const adminId = new mongoose.Types.ObjectId();
      const targetId = new mongoose.Types.ObjectId();
      const entry = await recordAudit({
        action: AUDIT_ACTIONS.PRODUCT_DELETE,
        adminId,
        targetId,
      });
      expect(entry.targetId).toBe(String(targetId));
    });

    it("throws AuditError when the action is missing", async () => {
      const adminId = new mongoose.Types.ObjectId();
      await expect(recordAudit({ adminId })).rejects.toBeInstanceOf(AuditError);
    });

    it("throws AuditError when the acting administrator is missing", async () => {
      await expect(
        recordAudit({ action: AUDIT_ACTIONS.ORDER_CANCEL })
      ).rejects.toBeInstanceOf(AuditError);
    });

    it("does not expose any read surface for customers (server-side only)", async () => {
      // The audit service intentionally provides no customer-facing read API:
      // there is no exported getter that returns audit entries (Req 26.5).
      const mod = await import("./audit.service.js");
      const exported = Object.keys(mod.default);
      expect(exported).not.toContain("getAuditLogs");
      expect(exported).not.toContain("listAuditEntries");
    });
  });

  describe("directAuditRecorder", () => {
    it("returns a recorder that persists a fully-formed entry", async () => {
      const recorder = directAuditRecorder();
      const adminId = new mongoose.Types.ObjectId();

      await recorder({
        action: AUDIT_ACTIONS.ORDER_CANCEL,
        adminId,
        targetType: "Order",
        targetId: "POT-000001-0001",
      });

      const entries = await AuditLog.find({}).lean();
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("order.cancel");
      expect(entries[0].targetId).toBe("POT-000001-0001");
    });
  });

  describe("requestAuditRecorder", () => {
    it("returns a per-request factory whose recorder persists the entry", async () => {
      const factory = requestAuditRecorder();
      const recorder = factory({ ip: "127.0.0.1" });
      const adminId = new mongoose.Types.ObjectId();

      await recorder({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        adminId,
        targetType: "SystemSettings",
        targetId: "razorpay",
        metadata: { fields: ["keyId"] },
      });

      const entries = await AuditLog.find({}).lean();
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("settings.update");
      expect(entries[0].metadata).toEqual({ fields: ["keyId"] });
    });
  });

  describe("loginAuditRecorder", () => {
    it("maps the login handler shape ({ action, admin }) onto an audit entry", async () => {
      const factory = loginAuditRecorder();
      const adminId = new mongoose.Types.ObjectId();
      const recorder = factory({ ip: "127.0.0.1" });

      await recorder.record({
        action: AUDIT_ACTIONS.ADMIN_LOGIN,
        admin: { id: adminId, email: "admin@example.com" },
      });

      const entries = await AuditLog.find({}).lean();
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("ADMIN_LOGIN");
      expect(String(entries[0].adminId)).toBe(String(adminId));
      expect(entries[0].targetType).toBe("Admin");
      expect(entries[0].metadata).toEqual({ email: "admin@example.com" });
    });

    it("defaults the action to ADMIN_LOGIN", async () => {
      const factory = loginAuditRecorder();
      const adminId = new mongoose.Types.ObjectId();
      await factory({}).record({ admin: { id: adminId } });

      const entries = await AuditLog.find({}).lean();
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("ADMIN_LOGIN");
    });

    it("swallows audit failures and logs them so login is never blocked", async () => {
      const logger = { error: vi.fn() };
      const factory = loginAuditRecorder({ logger });
      // No admin id -> recordAudit throws -> recorder must swallow + log.
      const result = await factory({}).record({ admin: {} });

      expect(result).toBeUndefined();
      expect(logger.error).toHaveBeenCalledTimes(1);
      const entries = await AuditLog.find({}).lean();
      expect(entries).toHaveLength(0);
    });
  });
});
