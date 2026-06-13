import mongoose from "mongoose";

/**
 * Admin model (Req 14, 22).
 *
 * Stores only a bcrypt password hash; plaintext passwords are never persisted
 * (Req 22.1, 22.2). The `passwordHash` is stripped from any serialized output
 * so it can never appear in an API response (Req 22.4).
 */

const { Schema } = mongoose;

const adminSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        // Never expose the credential hash (Req 22.4).
        delete ret.passwordHash;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret) {
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

const Admin = mongoose.models.Admin || mongoose.model("Admin", adminSchema);

export default Admin;
