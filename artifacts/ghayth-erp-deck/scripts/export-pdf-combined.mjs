import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const DELIVERABLES = resolve(process.cwd(), "..", "..", "deliverables");
const SHORT_PDF = resolve(DELIVERABLES, "Ghayth-ERP-Presentation.pdf");
const DEEP_PDF = resolve(DELIVERABLES, "Ghayth-ERP-DeepDive.pdf");
const OUT = resolve(DELIVERABLES, "Ghayth-ERP-Combined.pdf");

const SLIDE_W = 1920;
const SLIDE_H = 1080;

async function ensureExists(path, label) {
  try {
    const s = await stat(path);
    if (!s.isFile()) throw new Error(`${label} is not a file: ${path}`);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      throw new Error(
        `${label} not found at ${path}. Run \`pnpm run export-pdf\` and \`pnpm run export-pdf-deep\` first.`,
      );
    }
    throw err;
  }
}

async function buildDividerPage(merged) {
  const page = merged.addPage([SLIDE_W, SLIDE_H]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: SLIDE_W,
    height: SLIDE_H,
    color: rgb(0x0e / 255, 0x3b / 255, 0x43 / 255),
  });

  const accent = rgb(0xe8 / 255, 0xc2 / 255, 0x6b / 255);
  page.drawRectangle({
    x: SLIDE_W / 2 - 220,
    y: SLIDE_H / 2 - 4,
    width: 440,
    height: 8,
    color: accent,
  });

  const font = await merged.embedFont(StandardFonts.HelveticaBold);
  const subFont = await merged.embedFont(StandardFonts.Helvetica);

  const title = "Deep Dive Session";
  const titleSize = 96;
  const titleWidth = font.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: (SLIDE_W - titleWidth) / 2,
    y: SLIDE_H / 2 + 60,
    size: titleSize,
    font,
    color: rgb(1, 1, 1),
  });

  const subtitle = "Ghayth ERP — Extended Edition";
  const subtitleSize = 36;
  const subtitleWidth = subFont.widthOfTextAtSize(subtitle, subtitleSize);
  page.drawText(subtitle, {
    x: (SLIDE_W - subtitleWidth) / 2,
    y: SLIDE_H / 2 - 120,
    size: subtitleSize,
    font: subFont,
    color: rgb(0.85, 0.9, 0.92),
  });
}

async function appendPdf(merged, srcPath, label) {
  const bytes = await readFile(srcPath);
  const src = await PDFDocument.load(bytes);
  const indices = src.getPageIndices();
  const copied = await merged.copyPages(src, indices);
  for (const p of copied) merged.addPage(p);
  console.log(`Appended ${label}: ${indices.length} pages from ${srcPath}`);
}

async function main() {
  await mkdir(dirname(OUT), { recursive: true });
  await ensureExists(SHORT_PDF, "Short presentation PDF");
  await ensureExists(DEEP_PDF, "Deep-dive PDF");

  const merged = await PDFDocument.create();

  await appendPdf(merged, SHORT_PDF, "executive deck");
  await buildDividerPage(merged);
  console.log("Inserted divider page");
  await appendPdf(merged, DEEP_PDF, "deep-dive deck");

  merged.setTitle("غيث ERP — العرض الموحّد (تنفيذي + موسّع)");
  merged.setAuthor("Ghayth ERP");
  merged.setSubject("Ghayth ERP Combined Presentation (Executive + Deep Dive)");
  merged.setLanguage("ar");

  const out = await merged.save();
  await writeFile(OUT, out);
  console.log(
    `Combined PDF written to: ${OUT} (${out.length} bytes, ${merged.getPageCount()} pages)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
