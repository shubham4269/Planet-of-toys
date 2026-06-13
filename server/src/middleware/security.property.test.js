// Feature: planet-of-toys-ecommerce, Property 34: Input sanitization neutralizes injection payloads
//
// Property 34: Input sanitization neutralizes injection payloads
// "For any request input containing MongoDB operator keys (e.g. keys beginning
//  with `$` or containing `.`) or HTML/script content, the sanitized input has
//  those operators removed/neutralized and HTML escaped, while preserving safe
//  content."
//
// Validates: Requirements 19.4
//
// Strategy: generate arbitrary, deeply-nested input objects whose keys are a mix
// of safe identifiers and injection keys ($-prefixed operators and dotted paths)
// and whose string leaves are a mix of safe text and HTML/script payloads. After
// sanitizeInput, three independent invariants must hold across the entire tree:
//   1. No key anywhere contains `$` or `.` (operator injection neutralized).
//   2. No string leaf contains a raw HTML-significant character, and every `&`
//      begins a known HTML entity (XSS payloads escaped, none left unescaped).
//   3. Safe content is preserved: a known-correct reference escaper reproduces
//      exactly the sanitized output (nothing dropped, nothing over-mangled).

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { sanitizeInput, escapeHtml, neutralizeKey } from "./security.js";

/** Raw HTML-significant characters that must never survive sanitization. */
const RAW_HTML_CHARS = ["<", ">", '"', "'", "`", "=", "/"];

/** The complete set of entities escapeHtml may emit; every `&` must start one. */
const KNOWN_ENTITIES = [
  "&amp;",
  "&lt;",
  "&gt;",
  "&quot;",
  "&#x27;",
  "&#x2F;",
  "&#x60;",
  "&#x3D;",
];

/**
 * Independent reference escaper used only as a model oracle. Mirrors the
 * required escaping semantics so we can confirm safe content is preserved
 * (no characters are dropped and only HTML-significant ones are transformed).
 */
const REF_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
  "`": "&#x60;",
  "=": "&#x3D;",
};
function refSanitize(node) {
  if (typeof node === "string") {
    return node.replace(/[&<>"'`=/]/g, (ch) => REF_MAP[ch]);
  }
  if (Array.isArray(node)) return node.map(refSanitize);
  if (node !== null && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k.replace(/[$.]/g, "_")] = refSanitize(v);
    }
    return out;
  }
  return node;
}

/** Walks the sanitized tree asserting the two structural invariants (1 & 2). */
function assertSanitizedInvariants(node) {
  if (typeof node === "string") {
    for (const ch of RAW_HTML_CHARS) {
      expect(node.includes(ch)).toBe(false);
    }
    // Every ampersand must be the start of a recognized HTML entity.
    for (let i = node.indexOf("&"); i !== -1; i = node.indexOf("&", i + 1)) {
      const rest = node.slice(i);
      expect(KNOWN_ENTITIES.some((e) => rest.startsWith(e))).toBe(true);
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach(assertSanitizedInvariants);
    return;
  }
  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      expect(key.includes("$")).toBe(false);
      expect(key.includes(".")).toBe(false);
      assertSanitizedInvariants(value);
    }
  }
}

// ---- Generators ------------------------------------------------------------

/** Safe identifier-style keys (never contain `$` or `.`). */
const safeKey = fc.stringOf(
  fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJ_0123456789".split("")),
  { minLength: 1, maxLength: 8 }
);

/** Injection keys: `$`-prefixed operators and dotted access paths. */
const injectionKey = fc.oneof(
  fc.constantFrom("$gt", "$lt", "$ne", "$where", "$set", "$or", "$gte"),
  safeKey.map((s) => "$" + s),
  fc.tuple(safeKey, safeKey).map(([a, b]) => `${a}.${b}`),
  fc.constantFrom("a.b", "user.role", "nested.$gt", "$a.b")
);

const anyKey = fc.oneof(safeKey, injectionKey);

/** HTML/script payload strings interleaved with safe text. */
const htmlString = fc.stringOf(
  fc.constantFrom(
    ..."<>\"'`=/&".split(""),
    ..."abcdefg ALERT script img onerror 123".split("")
  ),
  { maxLength: 40 }
);

const safeString = fc.string({ maxLength: 30 });

const leaf = fc.oneof(
  htmlString,
  safeString,
  fc.constantFrom(
    "<script>alert('xss')</script>",
    "<img src=x onerror=alert(1)>",
    "javascript:void(0)",
    "plain safe text 42"
  ),
  fc.integer(),
  fc.double({ noNaN: true }),
  fc.boolean(),
  fc.constant(null)
);

/** Arbitrary nested input object with injection keys and HTML leaves. */
const { inputObject } = fc.letrec((tie) => ({
  value: fc.oneof({ maxDepth: 3 }, leaf, tie("array"), tie("inputObject")),
  array: fc.array(tie("value"), { maxLength: 4 }),
  inputObject: fc.dictionary(anyKey, tie("value"), { maxKeys: 5 }),
}));

// ---- Property --------------------------------------------------------------

describe("Property 34: Input sanitization neutralizes injection payloads", () => {
  it("removes $/dotted keys and escapes HTML while preserving safe content", () => {
    fc.assert(
      fc.property(inputObject, (input) => {
        const sanitized = sanitizeInput(input);

        // Invariants 1 & 2: no operator keys, no unescaped HTML anywhere.
        assertSanitizedInvariants(sanitized);

        // Invariant 3: safe content preserved — an independent reference
        // escaper reproduces the sanitized output exactly.
        expect(sanitized).toEqual(refSanitize(input));
      }),
      { numRuns: 200 }
    );
  });

  it("guarantees escapeHtml/neutralizeKey leave no raw injection vectors", () => {
    fc.assert(
      fc.property(htmlString, injectionKey, (text, key) => {
        const escaped = escapeHtml(text);
        for (const ch of RAW_HTML_CHARS) {
          expect(escaped.includes(ch)).toBe(false);
        }
        const safeKeyOut = neutralizeKey(key);
        expect(safeKeyOut.includes("$")).toBe(false);
        expect(safeKeyOut.includes(".")).toBe(false);
      }),
      { numRuns: 200 }
    );
  });
});
