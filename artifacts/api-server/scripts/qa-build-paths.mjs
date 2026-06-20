// Reconstruct FULL backend GET paths by joining the master inventory's
// per-file relative routes with the mount prefixes parsed from routes/index.ts.
// The /api/_routes scanner truncates multi-segment / middleware-wrapped mounts
// (e.g. /api/finance/accounts -> /api/accounts), so it cannot be trusted as a
// path source. This reconstruction is then VALIDATED against the live server as
// owner (non-404 == real path) before any RBAC matrix is built on it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../../..");
const INDEX = path.join(REPO, "artifacts/api-server/src/routes/index.ts");
const INV = path.join(REPO, "docs/testing/generated/GHAITH_MASTER_TEST_INVENTORY.json");

const idx = fs.readFileSync(INDEX, "utf8");

// 1) imports: var -> module base (without .js)
const varToFile = {};
const impRe = /import\s+(?:(\w+)|\{([^}]+)\})\s+from\s+"\.\/([\w.-]+)\.js"/g;
let m;
while ((m = impRe.exec(idx))) {
  const file = m[3];
  if (m[1]) varToFile[m[1]] = file;
  if (m[2]) {
    for (const part of m[2].split(",")) {
      const t = part.trim();
      const asM = t.match(/(\w+)\s+as\s+(\w+)/);
      if (asM) varToFile[asM[2]] = file;
      else if (t) varToFile[t] = file;
    }
  }
}

// 2) mounts: router.use("/prefix", ...args, VAR);  -> last identifier = VAR
const varToPrefix = {};
const mountRe = /router\.use\(\s*"(\/[^"]*)"\s*,([^;]*?)\)\s*;/g;
while ((m = mountRe.exec(idx))) {
  const prefix = m[1];
  const args = m[2];
  // last bare identifier token in args list
  const ids = args.match(/[A-Za-z_]\w*/g) || [];
  const last = ids[ids.length - 1];
  if (last && !(last in varToPrefix)) varToPrefix[last] = prefix;
  else if (last) {
    // a var mounted twice: keep first; record conflict
  }
}

// file base -> prefix (a file's exported router(s) share its mount)
const fileToPrefix = {};
for (const [v, file] of Object.entries(varToFile)) {
  if (varToPrefix[v]) {
    if (!fileToPrefix[file]) fileToPrefix[file] = varToPrefix[v];
  }
}

const inv = JSON.parse(fs.readFileSync(INV, "utf8"));
const eps = inv.backend.endpoints;
const gets = eps.filter((e) => e.method === "GET");

let resolved = 0,
  unresolved = 0;
const out = [];
const unresolvedFiles = new Set();
for (const e of gets) {
  const base = path.basename(e.file).replace(/\.ts$/, "");
  const prefix = fileToPrefix[base];
  if (!prefix) {
    unresolved++;
    unresolvedFiles.add(base);
    continue;
  }
  let full = "/api" + prefix + (e.path === "/" ? "" : e.path);
  full = full.replace(/\/+/g, "/");
  out.push({ full, rel: e.path, file: base, prefix });
  resolved++;
}

const paramFree = out.filter((o) => !o.full.includes(":") && !o.full.includes("*"));
const uniqFull = [...new Set(paramFree.map((o) => o.full))];

console.log("total GET endpoints:", gets.length);
console.log("resolved (file->prefix):", resolved, " unresolved:", unresolved);
console.log("unresolved files:", [...unresolvedFiles].sort().join(", "));
console.log("param-free resolved GET (unique full):", uniqFull.length);

fs.writeFileSync("/tmp/qa_full_getpaths.json", JSON.stringify(uniqFull, null, 0));
fs.writeFileSync(
  "/tmp/qa_unresolved_files.json",
  JSON.stringify([...unresolvedFiles].sort(), null, 0),
);
console.log("wrote /tmp/qa_full_getpaths.json");
