// server/src/modules/catalog/attribute.service.test.js
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Attribute from "./attribute.model.js";
import AttributeValue from "./attributeValue.model.js";
import { Product } from "../../models/index.js";
import * as svc from "./attribute.service.js";
import { CatalogValidationError } from "./catalog.errors.js";

let mongod;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); if (mongod) await mongod.stop(); });
afterEach(async () => { await Attribute.deleteMany({}); await AttributeValue.deleteMany({}); await Product.deleteMany({}); });

describe("attribute.service", () => {
  it("creates an attribute and lists it with its (empty) values", async () => {
    const a = await svc.createAttribute({ name: "Age Group", displayType: "checkbox" });
    expect(a.slug).toBe("age-group");
    const list = await svc.listAttributes({ includeArchived: false });
    expect(list).toHaveLength(1);
    expect(list[0].values).toEqual([]);
  });

  it("rejects an invalid displayType", async () => {
    await expect(svc.createAttribute({ name: "X", displayType: "bogus" }))
      .rejects.toBeInstanceOf(CatalogValidationError);
  });

  it("adds values (unique slug per attribute) and nests them in listAttributes", async () => {
    const a = await svc.createAttribute({ name: "Age Group", displayType: "checkbox" });
    await svc.addValue(a.id, { name: "0-12 Months" });
    await svc.addValue(a.id, { name: "0-12 Months" });
    const list = await svc.listAttributes({ includeArchived: false });
    expect(list[0].values.map((v) => v.slug)).toEqual(["0-12-months", "0-12-months-2"]);
  });

  it("refuses to archive a value assigned to a product", async () => {
    const a = await svc.createAttribute({ name: "Age Group", displayType: "checkbox" });
    const v = await svc.addValue(a.id, { name: "0-12 Months" });
    await Product.create({ name: "P", slug: "p", price: 10, stock: 1, attributeValueIds: [v.id] });
    await expect(svc.archiveValue(v.id)).rejects.toBeInstanceOf(CatalogValidationError);
  });

  it("archives/restores an attribute and excludes archived from default list", async () => {
    const a = await svc.createAttribute({ name: "Theme", displayType: "checkbox" });
    await svc.archiveAttribute(a.id);
    expect(await svc.listAttributes({ includeArchived: false })).toHaveLength(0);
    await svc.restoreAttribute(a.id);
    expect(await svc.listAttributes({ includeArchived: false })).toHaveLength(1);
  });

  it("lists only filterable+active attributes (with active values) for public", async () => {
    const a = await svc.createAttribute({ name: "Age Group", displayType: "checkbox" });
    await svc.addValue(a.id, { name: "0-12 Months" });
    const hidden = await svc.createAttribute({ name: "Internal", displayType: "checkbox", isFilterable: false });
    await svc.addValue(hidden.id, { name: "x" });
    const pub = await svc.listPublicAttributes();
    expect(pub).toHaveLength(1);
    expect(pub[0].name).toBe("Age Group");
    expect(pub[0].values).toHaveLength(1);
  });
});
