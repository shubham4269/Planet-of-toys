import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createContentService } from "./content.service.js";
import FooterContent from "./footerContent.model.js";

let mongod; const service = createContentService();
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await FooterContent.deleteMany({}); });

describe("content service — footer", () => {
  it("creates the singleton on first read", async () => {
    const footer = await service.getFooter();
    expect(footer.id).toBeDefined();
    expect(footer.enabled).toBe(true);
    expect(await FooterContent.countDocuments()).toBe(1);
  });

  it("persists an update and decodes escaped slashes in link urls", async () => {
    const footer = await service.updateFooter({
      enabled: true,
      columns: [{ title: "Shop", links: [{ label: "Sale", url: "&#x2F;sale" }] }],
      social: [{ platform: "facebook", url: "https://fb.com/x" }],
      copyrightText: "© 2026 Planet of Toys.",
    });
    expect(footer.columns[0].links[0].url).toBe("/sale");
    expect(footer.copyrightText).toContain("Planet of Toys");
  });

  it("public read returns disabled shape when off", async () => {
    await service.updateFooter({ enabled: false, columns: [{ title: "X", links: [{ label: "a", url: "/a" }] }] });
    const pub = await service.getPublicFooter();
    expect(pub.enabled).toBe(false);
  });

  it("public read drops disabled/empty items, omits social without url, and admin flags", async () => {
    await service.updateFooter({
      enabled: true,
      columns: [
        { title: "Keep", enabled: true, links: [{ label: "A", url: "/a", enabled: true }, { label: "Hidden", url: "/h", enabled: false }] },
        { title: "Gone", enabled: false, links: [{ label: "B", url: "/b" }] },
        { title: "Empty", enabled: true, links: [] },
      ],
      social: [{ platform: "facebook", url: "https://fb" }, { platform: "instagram", url: "" }],
      newsletter: { enabled: false, title: "n" },
      bottomLinks: [{ label: "Privacy", url: "/p", enabled: true }, { label: "Off", url: "/o", enabled: false }],
    });
    const pub = await service.getPublicFooter();
    expect(pub.columns).toHaveLength(1);
    expect(pub.columns[0].links).toHaveLength(1);
    expect(pub.columns[0].links[0].enabled).toBeUndefined();
    expect(pub.social).toHaveLength(1);
    expect(pub.newsletter).toBeUndefined();
    expect(pub.bottomLinks).toHaveLength(1);
  });
});
