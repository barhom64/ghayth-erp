import { ReplitConnectors } from "@replit/connectors-sdk";
import fs from "fs";

const OWNER = "barhom64", REPO = "ghayth-erp", BRANCH = "main";
const FILE = "db/schema.sql";
const c = new ReplitConnectors();

async function gh(ep, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await c.proxy("github", ep, opts);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { _raw: text }; }
  if (res.status >= 300) throw new Error(`${method} ${ep} → ${res.status}: ${(data?.message||text).slice(0,200)}`);
  return data;
}

const ref = await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
const baseSha = ref.object.sha;
console.log("base commit:", baseSha.slice(0,7));

const baseCommit = await gh(`/repos/${OWNER}/${REPO}/git/commits/${baseSha}`);
const baseTreeSha = baseCommit.tree.sha;

const content = fs.readFileSync(FILE).toString("base64");
console.log(`creating blob (${(content.length/1024).toFixed(0)}KB b64)…`);
const blob = await gh(`/repos/${OWNER}/${REPO}/git/blobs`, "POST", { content, encoding: "base64" });
console.log("blob:", blob.sha.slice(0,7));

const tree = await gh(`/repos/${OWNER}/${REPO}/git/trees`, "POST", {
  base_tree: baseTreeSha,
  tree: [{ path: FILE, mode: "100644", type: "blob", sha: blob.sha }],
});
console.log("tree:", tree.sha.slice(0,7));

const commit = await gh(`/repos/${OWNER}/${REPO}/git/commits`, "POST", {
  message: `db: regenerate schema.sql with PG16-compatible ordering (311 tables / 376 FKs / 596 indexes)`,
  tree: tree.sha,
  parents: [baseSha],
});
console.log("commit:", commit.sha.slice(0,7));

await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, "PATCH", { sha: commit.sha });
console.log("✓ pushed", commit.sha.slice(0,7));
