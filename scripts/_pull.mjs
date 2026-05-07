import { ReplitConnectors } from "@replit/connectors-sdk";
import fs from "fs";
import path from "path";

const c = new ReplitConnectors();
const files = fs.readFileSync("/tmp/_pull_files.txt", "utf-8").split("\n").filter(Boolean);
console.log(`pulling ${files.length} files from main...`);

let ok = 0, fail = 0;
const failures = [];
for (const f of files) {
  try {
    const r = await c.proxy("github", `/repos/barhom64/ghayth-erp/contents/${f}?ref=main`, { method: "GET" });
    const data = JSON.parse(await r.text());
    if (r.status !== 200) { console.log("FAIL", r.status, f); fail++; failures.push(f); continue; }
    const content = Buffer.from(data.content, "base64");
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
    ok++;
  } catch (e) { console.log("ERR", f, e.message); fail++; failures.push(f); }
}
console.log(`done: ${ok} ok, ${fail} failed`);
if (failures.length) console.log("failures:", failures);
