// server/src/modules/catalog/productAssign.service.js
import { Product } from "../../models/index.js";
import { CatalogValidationError } from "./catalog.errors.js";

const FIELDS = ["categoryIds", "collectionIds", "attributeValueIds"];

/** Build a $addToSet / $pull sub-document from an {field: [ids]} map. */
function buildSetOp(map = {}, operator) {
  const op = {};
  for (const f of FIELDS) {
    const ids = map[f];
    if (Array.isArray(ids) && ids.length > 0) {
      op[f] = operator === "$addToSet" ? { $each: ids } : { $in: ids };
    }
  }
  return op;
}

/**
 * Bulk add/remove taxonomy references across many products in two updateMany
 * round-trips ($addToSet for add, $pull for remove). Scales to thousands of
 * products without per-document writes.
 *
 * @param {{ productIds: string[], add?: object, remove?: object }} input
 * @returns {{ matched: number, modified: number }}
 */
export async function bulkAssign({ productIds, add = {}, remove = {} } = {}) {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw new CatalogValidationError("Provide at least one product id.");
  }
  let matched = 0;
  let modified = 0;
  const filter = { _id: { $in: productIds } };

  const addOp = buildSetOp(add, "$addToSet");
  if (Object.keys(addOp).length > 0) {
    const r = await Product.updateMany(filter, { $addToSet: addOp });
    matched = Math.max(matched, r.matchedCount ?? 0);
    modified += r.modifiedCount ?? 0;
  }
  const pullOp = buildSetOp(remove, "$pull");
  if (Object.keys(pullOp).length > 0) {
    const r = await Product.updateMany(filter, { $pull: pullOp });
    matched = Math.max(matched, r.matchedCount ?? 0);
    modified += r.modifiedCount ?? 0;
  }
  return { matched, modified };
}
