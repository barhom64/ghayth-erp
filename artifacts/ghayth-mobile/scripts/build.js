/**
 * Production build for the Ghayth ERP mobile app — WEB / PWA export.
 *
 * Produces an installable, browser-runnable single-page app under
 * `static-build/` via `expo export --platform web`, served same-origin with the
 * API at the `/mobile/` proxy path. This replaces the older Expo-Go OTA manifest
 * build: the deliverable now is a real web link users can open on their phone
 * and "Add to Home Screen" as a PWA.
 *
 * Steps:
 *   1. Resolve the backend domain (baked into the bundle as EXPO_PUBLIC_DOMAIN)
 *      and the base path (so every asset URL is prefixed with /mobile/).
 *   2. Temporarily inject `experiments.baseUrl` into app.json (restored after),
 *      so the export and the bundle reference assets under the base path. We do
 *      NOT commit baseUrl because the dev server (expo start) serves at root.
 *   3. Run `expo export --platform web` into static-build/.
 *   4. Drop in the PWA layer: manifest.webmanifest, a minimal service worker,
 *      and icons; then post-process index.html (lang/dir=ar/rtl + PWA <head>
 *      tags + SW registration).
 *
 * Zero runtime deps beyond Node built-ins + the Expo CLI (already installed).
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");

function findWorkspaceRoot(startDir) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error("Could not find workspace root (no pnpm-workspace.yaml found)");
}

const workspaceRoot = findWorkspaceRoot(projectRoot);

// Base path the app is served under behind the shared proxy (e.g. "/mobile").
// Trailing slash stripped for baseUrl; re-added where a directory URL is needed.
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");
const baseUrlDir = `${basePath}/`; // e.g. "/mobile/"

function stripProtocol(domain) {
  let urlString = domain.trim();
  if (!/^https?:\/\//i.test(urlString)) {
    urlString = `https://${urlString}`;
  }
  return new URL(urlString).host;
}

const PRODUCTION_API_DOMAIN = "erp.door.sa";

function getDeploymentDomain() {
  // Explicit override — set this for production mobile builds so the shipped
  // bundle ALWAYS targets the stable backend (same as the web), even when the
  // build runs on Replit where REPLIT_DEV_DOMAIN would otherwise win and rotate.
  if (process.env.EXPO_PUBLIC_API_DOMAIN) {
    return stripProtocol(process.env.EXPO_PUBLIC_API_DOMAIN);
  }
  if (process.env.REPLIT_INTERNAL_APP_DOMAIN) {
    return stripProtocol(process.env.REPLIT_INTERNAL_APP_DOMAIN);
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return stripProtocol(process.env.REPLIT_DEV_DOMAIN);
  }
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return stripProtocol(process.env.EXPO_PUBLIC_DOMAIN);
  }
  // Builds outside Replit (CI/VPS) have no REPLIT_* vars → canonical backend.
  console.log(
    `No domain env var set — defaulting to production backend ${PRODUCTION_API_DOMAIN}`,
  );
  return PRODUCTION_API_DOMAIN;
}

const APP_JSON = path.join(projectRoot, "app.json");
const STATIC_BUILD = path.join(projectRoot, "static-build");

function readAppName() {
  try {
    const appJson = JSON.parse(fs.readFileSync(APP_JSON, "utf-8"));
    return appJson.expo?.name || "غيث ERP";
  } catch {
    return "غيث ERP";
  }
}

/** Temporarily set experiments.baseUrl in app.json; returns a restore fn. */
function withBaseUrl(baseUrl) {
  const original = fs.readFileSync(APP_JSON, "utf-8");
  const j = JSON.parse(original);
  j.expo.experiments = j.expo.experiments || {};
  j.expo.experiments.baseUrl = baseUrl;
  fs.writeFileSync(APP_JSON, JSON.stringify(j, null, 2));
  console.log(`Injected experiments.baseUrl="${baseUrl}" into app.json`);
  return () => {
    fs.writeFileSync(APP_JSON, original);
    console.log("Restored original app.json");
  };
}

function runExport(domain) {
  console.log(`Exporting web build (EXPO_PUBLIC_DOMAIN=${domain})...`);
  if (fs.existsSync(STATIC_BUILD)) {
    fs.rmSync(STATIC_BUILD, { recursive: true, force: true });
  }
  const result = spawnSync(
    "pnpm",
    ["exec", "expo", "export", "--platform", "web", "--output-dir", "static-build"],
    {
      cwd: projectRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        EXPO_PUBLIC_DOMAIN: domain,
        EXPO_PUBLIC_REPL_ID: process.env.REPL_ID || process.env.EXPO_PUBLIC_REPL_ID || "",
      },
    },
  );
  if (result.status !== 0) {
    throw new Error(`expo export failed with code ${result.status}`);
  }
}

function writeManifest(appName) {
  const manifest = {
    name: appName,
    short_name: "غيث ERP",
    lang: "ar",
    dir: "rtl",
    start_url: baseUrlDir,
    scope: baseUrlDir,
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0f766e",
    icons: [
      { src: `${baseUrlDir}icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${baseUrlDir}icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${baseUrlDir}icons/maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  fs.writeFileSync(
    path.join(STATIC_BUILD, "manifest.webmanifest"),
    JSON.stringify(manifest, null, 2),
  );
  console.log("Wrote manifest.webmanifest");
}

function copyIcons() {
  const srcDir = path.join(projectRoot, "assets", "pwa");
  const destDir = path.join(STATIC_BUILD, "icons");
  fs.mkdirSync(destDir, { recursive: true });
  for (const f of ["icon-192.png", "icon-512.png", "maskable-512.png"]) {
    fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f));
  }
  console.log("Copied PWA icons");
}

function writeServiceWorker() {
  // Minimal, scope-limited SW (controls only /mobile/* — the API at /api is out
  // of scope and never intercepted). Hashed JS/asset URLs are immutable →
  // cache-first; navigations are network-first so a fresh deploy is picked up.
  const sw = `// Auto-generated by scripts/build.js. Do not edit.
const CACHE = "ghayth-mobile-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin/API
  const isNav = req.mode === "navigate";
  if (isNav) {
    event.respondWith(
      fetch(req).catch(() => caches.match("${baseUrlDir}").then((r) => r || caches.match("${baseUrlDir}index.html"))),
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    }),
  );
});
`;
  fs.writeFileSync(path.join(STATIC_BUILD, "sw.js"), sw);
  console.log("Wrote sw.js");
}

function postProcessIndexHtml(appName) {
  const indexPath = path.join(STATIC_BUILD, "index.html");
  let html = fs.readFileSync(indexPath, "utf-8");

  // Arabic / RTL document.
  html = html.replace(/<html[^>]*>/, '<html lang="ar" dir="rtl">');

  const head = `
    <meta name="theme-color" content="#0f766e" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="${appName}" />
    <link rel="manifest" href="${baseUrlDir}manifest.webmanifest" />
    <link rel="apple-touch-icon" href="${baseUrlDir}icons/icon-192.png" />
  `;
  html = html.replace("</head>", `${head}</head>`);

  const swReg = `
    <script>
      if ("serviceWorker" in navigator) {
        window.addEventListener("load", function () {
          navigator.serviceWorker
            .register("${baseUrlDir}sw.js", { scope: "${baseUrlDir}" })
            .catch(function (err) { console.warn("SW registration failed:", err); });
        });
      }
    </script>
  `;
  html = html.replace("</body>", `${swReg}</body>`);

  fs.writeFileSync(indexPath, html);
  console.log("Post-processed index.html (lang/dir + PWA head + SW registration)");
}

function main() {
  const domain = getDeploymentDomain();
  const appName = readAppName();
  console.log(`Workspace: ${workspaceRoot}`);
  console.log(`Base path: ${baseUrlDir}`);

  const restore = withBaseUrl(basePath);
  try {
    runExport(domain);
  } finally {
    restore();
  }

  copyIcons();
  writeManifest(appName);
  writeServiceWorker();
  postProcessIndexHtml(appName);

  console.log("Web/PWA build complete →", STATIC_BUILD);
}

try {
  main();
} catch (err) {
  console.error("Build failed:", err.message);
  process.exit(1);
}
