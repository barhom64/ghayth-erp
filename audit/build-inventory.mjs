#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROUTES_DIR = "artifacts/ghayth-erp/src/routes";
const API_DIR = "artifacts/api-server/src/routes";

const fePaths = new Set();
for (const f of readdirSync(ROUTES_DIR).filter(f => f.endsWith(".tsx"))) {
  const txt = readFileSync(join(ROUTES_DIR, f), "utf8");
  const matches = txt.match(/"\/[a-z][a-zA-Z0-9_/:?-]*"/g) || [];
  for (const m of matches) fePaths.add(m.slice(1, -1));
}

const indexTxt = readFileSync(join(API_DIR, "index.ts"), "utf8");

const importToFile = {};
for (const m of indexTxt.matchAll(/import\s+(?:\{?\s*([\w,\s]+?)\s*\}?)\s+from\s+["']\.\/([\w-]+)\.js["']/g)) {
  const names = m[1].split(",").map(s => s.replace(/^.*\bas\s+/, "").trim()).filter(Boolean);
  const file = `${m[2]}.ts`;
  for (const n of names) importToFile[n] = file;
}

const fileMounts = {};
const useRegex = /router\.use\(\s*["']([^"']+)["'][\s\S]*?(\w+Router)\s*\)/g;
for (const m of indexTxt.matchAll(useRegex)) {
  const prefix = m[1];
  const routerName = m[2];
  const file = importToFile[routerName];
  if (file) {
    if (!fileMounts[file]) fileMounts[file] = [];
    if (!fileMounts[file].includes(prefix)) fileMounts[file].push(prefix);
  }
}

const apiEndpoints = [];
for (const f of readdirSync(API_DIR).filter(f => f.endsWith(".ts") && f !== "index.ts")) {
  const txt = readFileSync(join(API_DIR, f), "utf8");
  const matches = txt.matchAll(/router\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g);
  const mounts = fileMounts[f] || [];
  for (const m of matches) {
    if (mounts.length === 0) {
      apiEndpoints.push({
        method: m[1].toUpperCase(),
        path: m[2],
        fullPath: null,
        file: f,
        mount: null,
      });
    } else {
      for (const mount of mounts) {
        apiEndpoints.push({
          method: m[1].toUpperCase(),
          path: m[2],
          fullPath: `/api${mount}${m[2]}`.replace(/\/+/g, "/"),
          file: f,
          mount,
        });
      }
    }
  }
}

const feByModule = {};
for (const p of fePaths) {
  const mod = p.split("/")[1] || "root";
  (feByModule[mod] ||= []).push(p);
}
for (const k of Object.keys(feByModule)) feByModule[k].sort();

const apiByFile = {};
for (const ep of apiEndpoints) {
  (apiByFile[ep.file] ||= []).push({ method: ep.method, path: ep.path, fullPath: ep.fullPath, mount: ep.mount });
}

const unmounted = [...new Set(apiEndpoints.filter(e => !e.fullPath).map(e => e.file))];

const inventory = {
  generatedAt: new Date().toISOString(),
  frontend: { totalRoutes: fePaths.size, byModule: feByModule, moduleCount: Object.keys(feByModule).length, allPaths: [...fePaths].sort() },
  api: {
    totalEndpoints: apiEndpoints.length,
    mountedEndpoints: apiEndpoints.filter(e => e.fullPath).length,
    byFile: apiByFile,
    fileMounts,
    unmountedFiles: unmounted,
    fileCount: Object.keys(apiByFile).length,
    methodBreakdown: apiEndpoints.reduce((a, e) => ({ ...a, [e.method]: (a[e.method] || 0) + 1 }), {}),
  },
};

writeFileSync("audit/inventory.json", JSON.stringify(inventory, null, 2));
console.log(`✅ FE: ${fePaths.size} routes / ${Object.keys(feByModule).length} modules`);
console.log(`✅ API: ${apiEndpoints.length} endpoints (mounted: ${inventory.api.mountedEndpoints}, unmounted: ${apiEndpoints.length - inventory.api.mountedEndpoints})`);
console.log(`✅ Files mounted: ${Object.keys(fileMounts).length} / unmounted: ${unmounted.length}`);
console.log(`Methods:`, inventory.api.methodBreakdown);
console.log(`Unmounted files:`, unmounted.slice(0, 10).join(", "));
