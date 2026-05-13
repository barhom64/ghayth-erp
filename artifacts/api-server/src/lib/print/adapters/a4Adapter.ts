/**
 * a4Adapter — renders the substituted HTML to a PDF. Uses PDFKit if it can
 * lay out a reasonable text/table flow; otherwise falls back to returning
 * the raw HTML wrapped in a print-ready document (the frontend opens it in an
 * iframe and triggers browser print, which is the existing pattern in this
 * codebase — see artifacts/ghayth-erp/src/components/print-layout.tsx).
 *
 * To keep this PR self-contained we ship the HTML-wrap path; a true HTML→PDF
 * adapter (Puppeteer/wkhtmltopdf) can be swapped in later behind this same
 * interface without touching the rest of the engine.
 */

import { renderContextToHtml } from "../variableSubstitution.js";
import type { FormatAdapter, RenderContext } from "../types.js";

const A4_CSS = `
@page { size: A4; margin: 16mm 14mm; }
* { box-sizing: border-box; }
html, body { margin:0; padding:0; font-family: 'Noto Naskh Arabic', 'Tahoma', sans-serif; color:#0f172a; }
body { direction: rtl; font-size: 11pt; line-height: 1.55; }
.print-doc { max-width: 100%; }
table { width:100%; border-collapse: collapse; margin: 8px 0; }
th, td { border:1px solid #cbd5e1; padding:6px 8px; text-align:right; }
th { background:#f1f5f9; }
.totals { margin-top:12px; display:flex; flex-direction:column; align-items:flex-start; gap:4px; }
.totals .grand { font-size:13pt; }
.signatures { display:flex; justify-content:space-around; margin-top:36px; padding-top:16px; border-top:1px dashed #94a3b8; }
.signatures > div { text-align:center; font-size:10pt; color:#475569; padding:0 8px; }
.meta-grid { display:grid; grid-template-columns: 1fr 1fr; gap:8px 24px; padding:8px 0; }
.notes { margin-top:12px; padding:8px; background:#fffbeb; border:1px solid #fde68a; border-radius:6px; }
.empty { color:#94a3b8; padding:8px; text-align:center; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

function wrapHtml(body: string, ctx: RenderContext): string {
  const title = `${ctx.entityType}-${ctx.entityId}`;
  const cssOverrides = ctx.template.cssOverrides ?? "";
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <title>${title}</title>
  <style>${A4_CSS}${cssOverrides}</style>
</head>
<body>
  ${body}
  <script>window.addEventListener('load', () => { try { setTimeout(() => window.print(), 200); } catch (_) {} });</script>
</body>
</html>`;
}

export const a4Adapter: FormatAdapter = {
  format: "a4",
  async render(ctx) {
    const html = renderContextToHtml(ctx);
    const full = wrapHtml(html, ctx);
    return {
      bytes: Buffer.from(full, "utf-8"),
      mime: "text/html; charset=utf-8",
      filename: `${ctx.entityType}-${ctx.entityId}.html`,
    };
  },
};
