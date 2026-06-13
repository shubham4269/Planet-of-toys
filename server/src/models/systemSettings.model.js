import mongoose from "mongoose";

/**
 * SystemSettings model (Req 30).
 *
 * Holds the four integration configuration sections (Razorpay, Shiprocket,
 * WhatsApp, Meta Pixel). Sensitive values are stored AES-256-GCM encrypted in
 * the `*Enc` fields; those encrypted secrets are stripped from any serialized
 * output so the API can only ever return masked, non-secret values
 * (Req 30.8, 30.9, 30.20). Non-secret identifiers (key id, email, phone number
 * id, pixel id) are retained for masked display.
 */

const { Schema } = mongoose;

const razorpaySchema = new Schema(
  {
    keyId: { type: String, default: null },
    keySecretEnc: { type: String, default: null },
    webhookSecretEnc: { type: String, default: null },
  },
  { _id: false }
);

const shiprocketSchema = new Schema(
  {
    email: { type: String, default: null },
    passwordEnc: { type: String, default: null },
    webhookTokenEnc: { type: String, default: null },
  },
  { _id: false }
);

const whatsappSchema = new Schema(
  {
    phoneNumberId: { type: String, default: null },
    accessTokenEnc: { type: String, default: null },
    verifyTokenEnc: { type: String, default: null },
  },
  { _id: false }
);

const metaPixelSchema = new Schema(
  {
    pixelId: { type: String, default: null },
  },
  { _id: false }
);

const systemSettingsSchema = new Schema(
  {
    razorpay: { type: razorpaySchema, default: () => ({}) },
    shiprocket: { type: shiprocketSchema, default: () => ({}) },
    whatsapp: { type: whatsappSchema, default: () => ({}) },
    metaPixel: { type: metaPixelSchema, default: () => ({}) },
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        // Strip all encrypted secrets from serialized output (Req 30.8, 30.20).
        if (ret.razorpay) {
          delete ret.razorpay.keySecretEnc;
          delete ret.razorpay.webhookSecretEnc;
        }
        if (ret.shiprocket) {
          delete ret.shiprocket.passwordEnc;
          delete ret.shiprocket.webhookTokenEnc;
        }
        if (ret.whatsapp) {
          delete ret.whatsapp.accessTokenEnc;
          delete ret.whatsapp.verifyTokenEnc;
        }
        return ret;
      },
    },
  }
);

const SystemSettings =
  mongoose.models.SystemSettings ||
  mongoose.model("SystemSettings", systemSettingsSchema);

export default SystemSettings;
