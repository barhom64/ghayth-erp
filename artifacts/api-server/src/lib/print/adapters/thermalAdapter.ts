/**
 * thermalAdapter — renders the substituted HTML at thermal-printer width
 * (80mm or 58mm). We emit HTML rather than raw ESC/POS so Arabic shaping is
 * preserved by the browser's text engine; the receipt printer driver picks
 * up the @page width and prints it correctly.
 */

import { renderContextToHtml } from "../variableSubstitution.js";
import type { FormatAdapter, PaperSize, RenderContext } from "../types.js";

function widthMm(paper: PaperSize): number {
  if (paper === "THERMAL_58") return 58;
  return 80;
}

function thermalCss(paper: PaperSize): string {
  const w = widthMm(paper);
  return `
@page { size: ${w}mm auto; margin: 2mm; }
* { box-sizing: border-box; }
html, body { margin:0; padding:0; font-family: 'Noto Naskh Arabic', monospace; color:#000; }
body { direction: rtl; font-size: 10pt; line-height: 1.3; width: ${w - 4}mm; }
.thermal-doc { width: 100%; }
.t-title { text-align:center; font-weight:bold; font-size:11pt; padding:4px 0; border-bottom:1px dashed #000; }
.t-meta { text-align:center; font-size:8pt; padding:2px 0; }
.t-totals { padding:4px 0; border-top:1px dashed #000; }
.t-grand { font-weight:bold; font-size:11pt; margin-top:2px; border-top:1px solid #000; padding-top:2px; }
.t-qr { text-align:center; padding:6px 0; }
table { width:100%; border-collapse: collapse; }
th, td { padding:1px 2px; font-size:9pt; }
th { border-bottom:1px solid #000; }
.watermark { display:none !important; }
@media print { body { -webkit-print-color-adjust: exact; } }
`;
}

function wrapHtml(body: string, ctx: RenderContext): string {
  const paper = (ctx.paperSize ?? (ctx.format === "thermal_58" ? "THERMAL_58" : "THERMAL_80")) as PaperSize;
  const css = thermalCss(paper);
  const overrides = ctx.template.cssOverrides ?? "";
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <title>${ctx.entityType}-${ctx.entityId}</title>
  <style>${css}${overrides}</style>
</head>
<body>
  ${body}
  <script>window.addEventListener('load', () => { try { setTimeout(() => window.print(), 150); } catch (_) {} });</script>
</body>
</html>`;
}

export const thermalAdapter: FormatAdapter = {
  format: "thermal_80",
  async render(ctx) {
    const html = renderContextToHtml(ctx);
    const full = wrapHtml(html, ctx);
    return {
      bytes: Buffer.from(full, "utf-8"),
      mime: "text/html; charset=utf-8",
      filename: `${ctx.entityType}-${ctx.entityId}-thermal.html`,
    };
  },
};

export const thermal58Adapter: FormatAdapter = {
  format: "thermal_58",
  async render(ctx) {
    const html = renderContextToHtml(ctx);
    const full = wrapHtml(html, ctx);
    return {
      bytes: Buffer.from(full, "utf-8"),
      mime: "text/html; charset=utf-8",
      filename: `${ctx.entityType}-${ctx.entityId}-thermal58.html`,
    };
  },
};
