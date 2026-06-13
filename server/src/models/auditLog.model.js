import mongoose from "mongoose";

/**
 * AuditLog model (Req 26, 30.12).
 *
 * Records security-relevant administrator actions (action type, acting
 * administrator, timestamp, and optional target/metadata). Entries are stored
 * server-side only and are excluded from customer responses (Req 26.5); the
 * service layer is responsible for never returning them to customers.
 */

const { Schema } = mongoose;

const auditLogSchema = new Schema(
  {
    action: { type: String, required: true, trim: true },
    adminId: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
    targetType: { type: String, default: null, trim: true },
    targetId: { type: String, default: null },
    timestamp: { type: Date, required: true, default: Date.now },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  {
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  }
);

const AuditLog = mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
