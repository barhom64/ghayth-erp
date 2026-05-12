import { ReplitConnectors } from "@replit/connectors-sdk";
import fs from "fs";
const c = new ReplitConnectors();
const FILES = ["CONTRIBUTING.md"];
const MSG = "docs: add CONTRIBUTING.md (3-level criteria: pre-flight push + PR hygiene + merge gate)";
async function gh(ep, m="GET", b=null) {
  const o = { method: m, headers: { "Content-Type": "application/json" } };
  if (b) o.body = JSON.stringify(b);
  for (let r=0; r<5; r++) {
    try {
      const res = await c.proxy("github", ep, o);
      const t = await res.text();
      let d; try { d = JSON.parse(t); } catch { d = { _raw: t }; }
      if (res.status >= 200 && res.status < 300) return { status: res.status, data: d };
      if (res.status === 404 && m === "GET") return { status: 404, data: d };
      console.log(`r${r+1}/5 ${m} ${res.status}`);
      await new Promise(s => setTimeout(s, 1500*(r+1)));
    } catch(e) { console.log(`r${r+1}/5 err: ${e.message}`); await new Promise(s => setTimeout(s, 1500*(r+1))); }
  }
}
for (const fp of FILES) {
  const content = fs.readFileSync(`/home/runner/workspace/${fp}`);
  const cur = await gh(`/repos/barhom64/ghayth-erp/contents/${fp}`);
  const sha = cur && cur.status === 200 ? cur.data.sha : undefined;
  const body = { message: MSG, content: content.toString("base64"), branch: "main" };
  if (sha) body.sha = sha;
  const r = await gh(`/repos/barhom64/ghayth-erp/contents/${fp}`, "PUT", body);
  console.log(`${r?.status} ${fp}`);
}
