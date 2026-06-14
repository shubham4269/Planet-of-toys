import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createContentService, ContentValidationError } from "./content.service.js";
import PromoBanner from "./promoBanner.model.js";

let mongod;
const service = createContentService();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

afterEach(async () => {
  await PromoBanner.deleteMany({});
});

describe("content service — promo banner", () => {
  it("creates the singleton on first read with defaults", async () => {
    const banner = await service.getPromoBanner();
    expect(banner.id).toBeDefined();
    expect(banner.enabled).toBe(false);
    expect(await PromoBanner.countDocuments()).toBe(1);
  });

  it("persists a validated update and clamps the interval to the minimum", async () => {
    const banner = await service.updatePromoBanner({
      enabled: true,
      rotationIntervalMs: 500,
      rightText: "Customer Care: 011-41410060",
      announcements: [{ text: "Free shipping over Rs.499", couponCode: "FREE499" }],
    });
    expect(banner.enabled).toBe(true);
    expect(banner.rotationIntervalMs).toBe(2000);
    expect(banner.announcements).toHaveLength(1);
    expect(banner.announcements[0].couponCode).toBe("FREE499");
  });

  it("decodes HTML-escaped slashes in links so URLs are not corrupted", async () => {
    // The global XSS sanitizer escapes "/" -> "&#x2F;" (and double-encodes on
    // re-save). The service must store the real URL so the link works.
    const banner = await service.updatePromoBanner({
      enabled: true,
      announcements: [
        { text: "Shop", url: "&#x2F;checkout&#x2F;tent-house" },
        { text: "Twice", url: "&amp;#x2F;products&amp;#x2F;lego" },
      ],
    });
    expect(banner.announcements[0].url).toBe("/checkout/tent-house");
    expect(banner.announcements[1].url).toBe("/products/lego");
  });

  it("rejects an announcement with empty text", async () => {
    await expect(
      service.updatePromoBanner({ announcements: [{ text: "  " }] })
    ).rejects.toBeInstanceOf(ContentValidationError);
  });

  it("rejects an invalid hex color", async () => {
    await expect(
      service.updatePromoBanner({ bgColor: "red" })
    ).rejects.toBeInstanceOf(ContentValidationError);
  });

  it("rejects a window where startAt is after endAt", async () => {
    await expect(
      service.updatePromoBanner({
        announcements: [
          { text: "x", startAt: "2026-02-01T00:00:00Z", endAt: "2026-01-01T00:00:00Z" },
        ],
      })
    ).rejects.toBeInstanceOf(ContentValidationError);
  });

  it("public read returns disabled shape when the banner is off", async () => {
    await service.updatePromoBanner({ enabled: false, announcements: [{ text: "hi" }] });
    const pub = await service.getPublicPromoBanner({ now: new Date("2026-06-14T00:00:00Z") });
    expect(pub.enabled).toBe(false);
    expect(pub.announcements).toEqual([]);
  });

  it("public read filters announcements by enabled and date window", async () => {
    await service.updatePromoBanner({
      enabled: true,
      announcements: [
        { text: "always" },
        { text: "disabled", enabled: false },
        { text: "future", startAt: "2026-07-01T00:00:00Z" },
        { text: "past", endAt: "2026-01-01T00:00:00Z" },
        { text: "current", startAt: "2026-06-01T00:00:00Z", endAt: "2026-12-01T00:00:00Z" },
      ],
    });
    const pub = await service.getPublicPromoBanner({ now: new Date("2026-06-14T00:00:00Z") });
    const texts = pub.announcements.map((a) => a.text);
    expect(texts).toEqual(["always", "current"]);
    // Public projection must not leak scheduling/enabled fields.
    expect(pub.announcements[0].startAt).toBeUndefined();
    expect(pub.announcements[0].enabled).toBeUndefined();
    expect(pub.announcements[0].showOnMobile).toBe(true);
  });
});
