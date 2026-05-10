import puppeteer from "puppeteer";
import { spawnSync } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { writeReport } from "./shots-report.mjs";

const DOMAIN = process.env.REPLIT_DEV_DOMAIN;
if (!DOMAIN) {
  console.error("REPLIT_DEV_DOMAIN not set");
  process.exit(1);
}
const ORIGIN = `https://${DOMAIN}`;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("ADMIN_EMAIL and ADMIN_PASSWORD env vars are required");
  process.exit(1);
}

const OUT_DIR = resolve(process.cwd(), "public/screenshots");

const SHOTS = [
  { name: "dashboard", path: "/dashboard" },
  { name: "hr", path: "/hr" },
  { name: "finance", path: "/finance" },
  { name: "operations", path: "/operations-center" },
  { name: "fleet", path: "/fleet" },
  { name: "properties", path: "/properties/dashboard" },
  { name: "legal", path: "/legal" },
  { name: "projects", path: "/projects" },
  { name: "support", path: "/support" },
  { name: "crm", path: "/crm" },
];

function detectChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  for (const bin of ["chromium", "chromium-browser", "google-chrome"]) {
    const r = spawnSync("which", [bin], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  throw new Error("Chromium not found");
}

async function login() {
  const res = await fetch(`${ORIGIN}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const data = await res.json();
  return { token: data.token, assignments: data.assignments || [] };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const { token, assignments } = await login();
  console.log(`[auth] got token (len=${token.length}), assignments=${assignments.length}`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: detectChromium(),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
  });

  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.log("[pageerror]", e.message));
    await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });

    // Seed localStorage with auth token first by visiting any page on the origin
    await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.evaluate(({ t, a }) => {
      localStorage.setItem("erp_token", t);
      localStorage.setItem("erp_assignments", JSON.stringify(a));
    }, { t: token, a: assignments });

    for (const shot of SHOTS) {
      const url = `${ORIGIN}${shot.path}`;
      console.log(`[shot] ${shot.name} -> ${url}`);
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
      await page.evaluateHandle("document.fonts.ready");
      // Suppress scrollbars and let content settle
      await page.addStyleTag({
        content: `html, body { overflow: hidden !important; } *::-webkit-scrollbar { display: none !important; }`,
      });
      await wait(1500);
      const buf = await page.screenshot({
        type: "png",
        fullPage: false,
        clip: { x: 0, y: 40, width: 1600, height: 960 },
      });
      const outPath = resolve(OUT_DIR, `${shot.name}.png`);
      await writeFile(outPath, buf);
      console.log(`[shot] saved ${outPath} (${buf.length} bytes)`);
    }
  } finally {
    await browser.close();
  }

  try {
    const pagesRoot = resolve(process.cwd(), "..", "ghayth-erp", "src", "pages");
    const maxAgeDays = Number(process.env.SHOTS_MAX_AGE_DAYS || 14);
    const { path: reportPath, stats } = await writeReport({
      shotsDir: OUT_DIR,
      pagesRoot,
      maxAgeDays,
    });
    const need = stats.rows.filter((r) => r.status === "⚠").length;
    console.log(
      `[refresh-shots] 📝 report: ${reportPath} (${need}/${stats.rows.length} need recapture)`,
    );
  } catch (err) {
    console.warn(`[refresh-shots] report generation failed: ${err.message}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
