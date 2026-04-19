import puppeteer from "puppeteer";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PDFDocument } from "pdf-lib";

const PORT = 4322;
const BASE = "/ghayth-erp-deck/";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT = resolve(process.cwd(), "..", "..", "deliverables", "Ghayth-ERP-DeepDive.pdf");

function detectChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  for (const bin of ["chromium", "chromium-browser", "google-chrome", "chrome"]) {
    const r = spawnSync("which", [bin], { encoding: "utf8" });
    if (r.status === 0) {
      const p = r.stdout.trim();
      if (p) return p;
    }
  }
  throw new Error("Chromium not found. Install chromium or set CHROMIUM_PATH.");
}
const CHROMIUM = detectChromium();
console.log(`Using chromium: ${CHROMIUM}`);

async function main() {
  await mkdir(dirname(OUT), { recursive: true });

  const server = spawn(
    "pnpm",
    ["exec", "vite", "preview", "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { env: { ...process.env, PORT: String(PORT), BASE_PATH: BASE }, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.on("data", (b) => process.stdout.write(`[vite] ${b}`));
  server.stderr.on("data", (b) => process.stderr.write(`[vite] ${b}`));

  const probe = `${ORIGIN}${BASE}deep/slide1`;
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(probe);
      if (res.ok || res.status === 304) { ready = true; break; }
    } catch {}
    await wait(500);
  }
  if (!ready) throw new Error("Preview server did not become ready");

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROMIUM,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
  });

  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.log("[pageerror]", e.message));
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });

    // Probe sequentially until the app redirects (unknown deep slide).
    let positions = [];
    for (let p = 1; p <= 30; p++) {
      const url = `${ORIGIN}${BASE}deep/slide${p}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await wait(250);
      const here = await page.evaluate(() => location.pathname);
      if (here.endsWith(`/deep/slide${p}`)) {
        positions.push(p);
      } else {
        break;
      }
    }
    console.log(`Deep deck has ${positions.length} slides:`, positions);

    const merged = await PDFDocument.create();

    for (const pos of positions) {
      const url = `${ORIGIN}${BASE}deep/slide${pos}`;
      console.log(`Rendering deep slide ${pos}: ${url}`);
      await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
      await page.evaluateHandle("document.fonts.ready");
      await wait(800);
      await page.addStyleTag({
        content: `
          @page { size: 1920px 1080px; margin: 0; }
          html, body { background: #0E3B43; margin: 0 !important; padding: 0 !important; overflow: hidden !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        `,
      });
      await wait(150);
      const buf = await page.pdf({
        width: "1920px",
        height: "1080px",
        printBackground: true,
        preferCSSPageSize: true,
        pageRanges: "1",
      });
      const slidePdf = await PDFDocument.load(buf);
      const [copied] = await merged.copyPages(slidePdf, [0]);
      merged.addPage(copied);
    }

    merged.setTitle("غيث ERP — جلسة تعمّق (نسخة موسّعة)");
    merged.setAuthor("Ghayth ERP");
    merged.setSubject("Ghayth ERP Deep-Dive Session");
    merged.setLanguage("ar");

    const out = await merged.save();
    await writeFile(OUT, out);
    console.log(`PDF written to: ${OUT} (${out.length} bytes, ${merged.getPageCount()} pages)`);
  } finally {
    await browser.close();
    server.kill("SIGTERM");
    await wait(500);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
