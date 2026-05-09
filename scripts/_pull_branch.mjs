import { ReplitConnectors } from "@replit/connectors-sdk";
import fs from "fs";
import path from "path";

const c = new ReplitConnectors();
const BRANCH = process.env.BRANCH || "main";
const files = fs.readFileSync("/tmp/_pull_files.txt", "utf-8").split("\n").filter(Boolean);
console.log(`pulling ${files.length} files from ${BRANCH}...`);

let ok = 0, fail = 0;
const failures = [];

// Parallelize in batches of 10
const BATCH = 10;
for (let i = 0; i < files.length; i += BATCH) {
  const batch = files.slice(i, i + BATCH);
  const results = await Promise.all(batch.map(async (f) => {
    try {
      const r = await c.proxy("github", `/repos/barhom64/ghayth-erp/contents/${encodeURI(f)}?ref=${encodeURIComponent(BRANCH)}`, { method: "GET" });
      const text = await r.text();
      if (r.status !== 200) return { f, ok: false, err: `HTTP ${r.status}` };
      const data = JSON.parse(text);
      const content = Buffer.from(data.content, "base64");
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, content);
      return { f, ok: true };
    } catch (e) { return { f, ok: false, err: e.message }; }
  }));
  for (const r of results) {
    if (r.ok) ok++;
    else { fail++; failures.push(r.f); console.log("FAIL", r.err, r.f); }
  }
  if ((i + BATCH) % 50 === 0 || i + BATCH >= files.length) console.log(`  progress: ${Math.min(i + BATCH, files.length)}/${files.length}`);
}
console.log(`done: ${ok} ok, ${fail} failed`);
if (failures.length) {
  fs.writeFileSync("/tmp/_pull_failures.txt", failures.join("\n"));
  console.log("failures saved to /tmp/_pull_failures.txt");
}
