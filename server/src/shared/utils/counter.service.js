import crypto from "node:crypto";

import Counter from "./counter.model.js";

/**
 * Order-ID Service (Req 8).
 *
 * Generates short, branded, human-friendly order identifiers in the format
 * `POT-XXXXX`, where `XXXXX` is a random 5-character code drawn from an
 * unambiguous alphabet (no 0/O, 1/I/L), e.g. `POT-8F4K2`. Random codes read
 * cleanly over phone/WhatsApp and do not reveal order volume the way
 * sequential or date-encoded identifiers do.
 *
 * Uniqueness is guaranteed by reserving each code in the Counter collection
 * (`_id: "order-id-<CODE>"`): the unique `_id` index makes a duplicate insert
 * fail atomically, in which case a fresh code is drawn. With a 31-character
 * alphabet there are 31^5 ≈ 28.6 million codes, so collisions stay rare and
 * the retry loop terminates immediately in practice (Req 8.2, 8.3).
 */

/** Unambiguous code alphabet: digits/letters minus 0, O, 1, I, L. */
const ORDER_ID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Length of the random code segment. */
const ORDER_ID_LENGTH = 5;

/** Upper bound on reservation retries before giving up loudly. */
const MAX_ATTEMPTS = 10;

/** Draw one random, unbiased code like "8F4K2". */
export function randomOrderCode() {
  let code = "";
  for (let i = 0; i < ORDER_ID_LENGTH; i += 1) {
    code += ORDER_ID_ALPHABET[crypto.randomInt(ORDER_ID_ALPHABET.length)];
  }
  return code;
}

/**
 * Generate the next unique order identifier (`POT-XXXXX`).
 *
 * Draws a random code and reserves it atomically; on the (rare) collision the
 * draw is repeated. The optional date parameter is accepted for backward
 * compatibility with the previous date-based format and is ignored.
 *
 * @returns {Promise<string>} the generated order identifier
 */
export async function nextOrderId() {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = randomOrderCode();
    try {
      // The unique _id index makes this reservation atomic: exactly one
      // concurrent caller can claim a given code (Req 8.2, 8.3).
      await Counter.create({ _id: `order-id-${code}` });
      return `POT-${code}`;
    } catch (error) {
      // Duplicate key -> code already used; draw again. Anything else is a
      // real persistence failure and must propagate.
      if (error?.code !== 11000) throw error;
    }
  }
  throw new Error("Unable to generate a unique order id.");
}

export default { nextOrderId };
