/**
 * Bundled-print composer — «طباعة مجمّعة».
 *
 * Ghayth's print engine emits HTML (the browser turns it into PDF on print),
 * so a "single PDF of the record + its attachments" is produced by composing
 * ONE print document the browser prints as a single PDF — no server-side PDF
 * library, reusing the existing pipeline.
 *
 * `buildBundleHtml` is a pure function (deterministic, unit-tested): given the
 * record's print HTML (optional, best-effort) + image attachments as data URLs
 * + a list of non-embeddable files, it returns one print-ready HTML document
 * with a page break between sections. `openBundlePrint` drives the browser.
 */

export interface BundleImage {
  /** Display caption (file/title name, Arabic-safe). */
  name: string;
  /** `data:image/...;base64,...` — embedded so no auth/CORS issues at print. */
  dataUrl: string;
}

export interface BundleOtherFile {
  name: string;
}

export interface BuildBundleOptions {
  /** Document title + fallback header when no record HTML is supplied. */
  title: string;
  /** The record's rendered print HTML (from the print engine). Optional —
   *  the bundle still works with attachments alone if record render fails. */
  recordHtml?: string | null;
  /** Image attachments embedded one-per-page. */
  images: BundleImage[];
  /** Non-image attachments (PDF/Office) that can't be inlined into print HTML —
   *  listed so the operator knows they exist and must be printed separately. */
  otherFiles?: BundleOtherFile[];
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

const BUNDLE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: system-ui, "Segoe UI", Tahoma, sans-serif; margin: 0; color: #111; }
  .bundle-page { padding: 16px; page-break-after: always; }
  .bundle-page:last-child { page-break-after: auto; }
  .bundle-cap { font-size: 14px; font-weight: 600; margin: 0 0 8px; color: #333; }
  .bundle-img { max-width: 100%; max-height: 95vh; object-fit: contain; display: block; margin: 0 auto; }
  .bundle-title { font-size: 20px; font-weight: 700; margin: 0 0 4px; }
  .bundle-list { font-size: 13px; padding-inline-start: 20px; }
  @media print { @page { margin: 12mm; } }
`;

export function buildBundleHtml(opts: BuildBundleOptions): string {
  const { title, recordHtml, images, otherFiles = [] } = opts;

  const recordSection = recordHtml
    ? `<section class="bundle-page bundle-record">${recordHtml}</section>`
    : `<section class="bundle-page"><h1 class="bundle-title">${escapeHtml(title)}</h1></section>`;

  const imageSections = images
    .map(
      (im) =>
        `<section class="bundle-page"><h2 class="bundle-cap">${escapeHtml(im.name)}</h2>` +
        `<img class="bundle-img" src="${im.dataUrl}" alt="${escapeHtml(im.name)}" /></section>`,
    )
    .join("\n");

  const otherSection = otherFiles.length
    ? `<section class="bundle-page"><h2 class="bundle-cap">مرفقات غير قابلة للتضمين (تُطبع منفصلة)</h2>` +
      `<ul class="bundle-list">${otherFiles.map((o) => `<li>${escapeHtml(o.name)}</li>`).join("")}</ul></section>`
    : "";

  return (
    `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8" />` +
    `<title>${escapeHtml(title)}</title><style>${BUNDLE_CSS}</style></head>` +
    `<body>${recordSection}${imageSections}${otherSection}</body></html>`
  );
}

/**
 * Opens the composed bundle in a new window and triggers the browser print
 * dialog once content is laid out. Returns false if the popup was blocked.
 */
export function openBundlePrint(html: string): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  // Print after layout/images settle; onload fires once embedded data-URL
  // images have decoded.
  w.onload = () => {
    try { w.print(); } catch { /* user can print manually */ }
  };
  return true;
}
