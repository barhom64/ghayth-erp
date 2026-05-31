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

// Print-grade CSS — tuned so the browser-print path produces a real,
// professionally-paginated PDF. Without these rules a long invoice would
// split the totals across pages, repeat-print the header inline, and lose
// table headers after page 1. The rules below mirror what a Puppeteer
// HTML→PDF engine would do server-side; once we wire one we keep this CSS
// because the same rules apply.
const A4_CSS = `
@page {
  size: A4;
  margin: 18mm 14mm 22mm 14mm;
  /* Page counter rendered in the footer (browser-native) */
  @bottom-center {
    content: "صفحة " counter(page) " من " counter(pages);
    font-family: 'Noto Naskh Arabic', 'Tahoma', sans-serif;
    font-size: 9pt;
    color: #64748b;
  }
}
* { box-sizing: border-box; }
html, body { margin:0; padding:0; font-family: 'Noto Naskh Arabic', 'Tahoma', sans-serif; color:#0f172a; }
body { direction: rtl; font-size: 11pt; line-height: 1.55; }
.print-doc { max-width: 100%; }

/* Tables ─ repeat thead on every page + never split a row in two */
table { width:100%; border-collapse: collapse; margin: 8px 0; }
thead { display: table-header-group; }
tfoot { display: table-footer-group; }
tr, td, th { page-break-inside: avoid; break-inside: avoid; }
th, td { border:1px solid #cbd5e1; padding:6px 8px; text-align:right; vertical-align:top; }
th { background:#f1f5f9; font-weight: 700; }

/* Totals / signatures / verify-block ─ keep them on one page */
.totals { margin-top:12px; display:flex; flex-direction:column; align-items:flex-start; gap:4px;
          page-break-inside: avoid; break-inside: avoid; }
.totals .grand { font-size:13pt; }
.signatures { display:flex; justify-content:space-around; margin-top:36px; padding-top:16px;
              border-top:1px dashed #94a3b8;
              page-break-inside: avoid; break-inside: avoid; page-break-before: auto; }
.signatures > div { text-align:center; font-size:10pt; color:#475569; padding:0 8px; }
.verify-block { page-break-inside: avoid; break-inside: avoid; }

/* Meta grid ─ small key/value pairs */
.meta-grid { display:grid; grid-template-columns: 1fr 1fr; gap:8px 24px; padding:8px 0;
             page-break-inside: avoid; break-inside: avoid; }
.notes { margin-top:12px; padding:8px; background:#fffbeb; border:1px solid #fde68a; border-radius:6px;
         page-break-inside: avoid; break-inside: avoid; }
.empty { color:#94a3b8; padding:8px; text-align:center; }

/* Headings never trail at the bottom of a page */
h1, h2, h3 { page-break-after: avoid; break-after: avoid-page; }

/* Print colour fidelity + Arabic ligatures + diacritics */
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* Hide the auto-print bootstrapper script's potential UI artefacts */
  a[href]:after { content: ""; }
  /* Inline images shouldn't break across pages */
  img { page-break-inside: avoid; }
}

/* Watermark stays fixed across every page (e.g. نسخة مكررة) */
.watermark {
  position: fixed;
  top: 40%; left: 50%;
  transform: translate(-50%, -50%) rotate(-30deg);
  font-size: 84pt;
  color: rgba(220,38,38,0.16);
  font-weight: bold;
  pointer-events: none;
  z-index: 9999;
  letter-spacing: 8px;
}
`;

function wrapHtml(body: string, ctx: RenderContext): string {
  // entityId comes from the request body — an attacker can send something
  // like "</title><script>alert(1)</script>" to escape the title element
  // and inject script that runs when the browser opens the doc to print.
  // Self-XSS only (their own session), but cheap to plug.
  const title = `${ctx.entityType}-${ctx.entityId}`
    .replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
  // cssOverrides comes from a template stored by an authenticated user with
  // templates:write. Even so, anything that closes the <style> tag would
  // break out into the document and execute as HTML (think "</style><script>
  // alert(1)</script>" pasted into the custom-CSS field). Strip any closing
  // </style> sequence — a real stylesheet has no use for one.
  const cssOverrides = typeof ctx.template.cssOverrides === "string"
    ? ctx.template.cssOverrides.replace(/<\s*\/\s*style/gi, "")
    : "";
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
