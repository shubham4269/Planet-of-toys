import { describe, it, expect } from "vitest";
import express from "express";
import {
  escapeHtml,
  neutralizeKey,
  sanitizeInput,
  applySecurityMiddleware,
} from "./security.js";
import { createApp } from "../../app.js";

describe("escapeHtml", () => {
  it("escapes HTML-significant characters", () => {
    expect(escapeHtml("<script>alert('x')</script>")).toBe(
      "&lt;script&gt;alert(&#x27;x&#x27;)&lt;&#x2F;script&gt;"
    );
  });

  it("preserves plain text content unchanged", () => {
    expect(escapeHtml("Hello world 123")).toBe("Hello world 123");
  });

  it("returns non-string values unchanged", () => {
    expect(escapeHtml(42)).toBe(42);
  });
});

describe("neutralizeKey", () => {
  it("replaces $-prefixed operator keys", () => {
    expect(neutralizeKey("$gt")).toBe("_gt");
    expect(neutralizeKey("$where")).toBe("_where");
  });

  it("replaces dotted keys", () => {
    expect(neutralizeKey("a.b.c")).toBe("a_b_c");
  });

  it("leaves safe keys unchanged", () => {
    expect(neutralizeKey("name")).toBe("name");
  });
});

describe("sanitizeInput", () => {
  it("escapes HTML in nested string values", () => {
    const out = sanitizeInput({ comment: "<img src=x onerror=alert(1)>" });
    expect(out.comment).toBe(
      "&lt;img src&#x3D;x onerror&#x3D;alert(1)&gt;"
    );
  });

  it("neutralizes operator-injection keys at every level", () => {
    const out = sanitizeInput({ $gt: "", filter: { "a.b": 1 } });
    expect(out).toHaveProperty("_gt");
    expect(out.filter).toHaveProperty("a_b", 1);
    expect(out).not.toHaveProperty("$gt");
  });

  it("processes arrays element by element", () => {
    expect(sanitizeInput(["<b>", "ok"])).toEqual(["&lt;b&gt;", "ok"]);
  });

  it("leaves non-string primitives unchanged", () => {
    expect(sanitizeInput({ n: 5, b: true, z: null })).toEqual({
      n: 5,
      b: true,
      z: null,
    });
  });
});

describe("applySecurityMiddleware integration", () => {
  function buildTestApp(allowedOrigins) {
    const app = express();
    app.use(express.json());
    applySecurityMiddleware(app, { allowedOrigins });
    app.post("/echo", (req, res) => res.json({ body: req.body }));
    app.get("/echo", (req, res) => res.json({ query: req.query }));
    return app;
  }

  it("sets helmet security headers", async () => {
    const app = buildTestApp(["http://localhost:5173"]);
    const server = app.listen(0);
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/echo`);
      // helmet's signature header
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("x-dns-prefetch-control")).toBeTruthy();
    } finally {
      server.close();
    }
  });

  it("allows configured origins and rejects others via CORS", async () => {
    const app = buildTestApp(["http://allowed.example"]);
    const server = app.listen(0);
    const { port } = server.address();
    try {
      const allowed = await fetch(`http://127.0.0.1:${port}/echo`, {
        headers: { Origin: "http://allowed.example" },
      });
      expect(allowed.headers.get("access-control-allow-origin")).toBe(
        "http://allowed.example"
      );

      const denied = await fetch(`http://127.0.0.1:${port}/echo`, {
        headers: { Origin: "http://evil.example" },
      });
      // Disallowed origin must not be reflected back.
      expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    } finally {
      server.close();
    }
  });

  it("sanitizes HTML and operator-injection keys in request bodies", async () => {
    const app = buildTestApp([]);
    const server = app.listen(0);
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/echo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "<script>alert(1)</script>",
          $gt: "",
          nested: { "a.b": "<b>x</b>" },
        }),
      });
      const { body } = await res.json();
      expect(body.name).toBe(
        "&lt;script&gt;alert(1)&lt;&#x2F;script&gt;"
      );
      expect(body).not.toHaveProperty("$gt");
      expect(body.nested).toHaveProperty("a_b", "&lt;b&gt;x&lt;&#x2F;b&gt;");
    } finally {
      server.close();
    }
  });
});

describe("createApp wires security middleware", () => {
  it("applies helmet headers through the app factory", async () => {
    const app = createApp({ allowedOrigins: ["http://localhost:5173"] });
    const server = app.listen(0);
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(200);
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    } finally {
      server.close();
    }
  });
});
