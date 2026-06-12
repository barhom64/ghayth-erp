/**
 * Standalone production server for the Ghayth ERP mobile WEB / PWA export.
 *
 * Serves the output of scripts/build.js (static-build/) as a single-page app:
 * - GET <base>/status                → health check (200)
 * - GET <base>/sw.js                 → service worker (with Service-Worker-Allowed)
 * - GET <base>/manifest.webmanifest  → PWA manifest
 * - existing static files            → served with the right content-type
 * - everything else (client routes)  → index.html (SPA fallback)
 *
 * Zero external dependencies — Node.js built-ins only (http, fs, path).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const STATIC_ROOT = path.resolve(__dirname, "..", "static-build");
const INDEX_HTML = path.join(STATIC_ROOT, "index.html");
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
};

function send(res, status, contentType, body, extraHeaders) {
  res.writeHead(status, { "content-type": contentType, ...(extraHeaders || {}) });
  res.end(body);
}

function serveIndex(res) {
  if (!fs.existsSync(INDEX_HTML)) {
    return send(res, 500, "text/plain; charset=utf-8", "Build not found");
  }
  // Network-first on the client (SW) — keep the shell uncached at the edge.
  send(res, 200, MIME_TYPES[".html"], fs.readFileSync(INDEX_HTML), {
    "cache-control": "no-cache",
  });
}

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const extra = {};
  // Hashed bundles/assets are immutable; the SW and manifest must stay fresh.
  if (filePath.includes(`${path.sep}_expo${path.sep}`) || /\.[0-9a-f]{8,}\./.test(filePath)) {
    extra["cache-control"] = "public, max-age=31536000, immutable";
  } else if (filePath.endsWith("sw.js")) {
    extra["cache-control"] = "no-cache";
    extra["Service-Worker-Allowed"] = `${basePath}/`;
  } else if (filePath.endsWith(".webmanifest")) {
    extra["cache-control"] = "no-cache";
  }
  send(res, 200, contentType, fs.readFileSync(filePath), extra);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = url.pathname;

  // Strip the proxy base path so paths resolve against static-build/.
  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || "/";
  }

  // Health check (used by ensurePreviewReachable).
  if (pathname === "/status") {
    return send(res, 200, "application/json", JSON.stringify({ status: "ok" }));
  }

  // Resolve a safe path inside STATIC_ROOT.
  const safeRel = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(STATIC_ROOT, safeRel);

  if (
    filePath.startsWith(STATIC_ROOT) &&
    fs.existsSync(filePath) &&
    fs.statSync(filePath).isFile()
  ) {
    return serveFile(filePath, res);
  }

  // SPA fallback: only GET navigations (no file extension) fall through to
  // index.html for client-side routing. A missing path WITH an extension is a
  // broken asset → 404 (so it isn't masked by a 200 HTML response). Non-GET
  // methods to unknown paths → 405.
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "text/plain; charset=utf-8", "Method Not Allowed", {
      allow: "GET, HEAD",
    });
  }
  if (path.extname(pathname)) {
    return send(res, 404, "text/plain; charset=utf-8", "Not Found");
  }
  return serveIndex(res);
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`Serving Ghayth mobile web/PWA build on port ${port} (base ${basePath || "/"})`);
});
