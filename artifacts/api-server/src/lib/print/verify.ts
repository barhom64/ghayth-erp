/**
 * Print verification — Phase 6 of the Print Platform.
 *
 * Every non-ephemeral render pre-allocates a UUID `jobId` BEFORE the
 * adapter runs, generates a QR code that encodes the public verify URL
 * (typically /api/print/verify/:jobId), and bakes both into the
 * document. The QR is included by templates via `{{system.verifyQr}}`
 * (data URL) or `{{system.verifyUrl}}` (raw text).
 *
 * The same UUID is then passed to writePrintJob as `jobIdOverride` so
 * the audit row's `jobId` column matches what's printed on paper. A
 * scanner that hits /print/verify/:jobId can then look up the row and
 * confirm authenticity.
 */

import QRCode from "qrcode";
import { randomUUID } from "node:crypto";
import { logger } from "../logger.js";

export interface VerifyContext {
  /** UUID, allocated upfront. */
  jobId: string;
  /** Public URL embedded in the QR. */
  verifyUrl: string;
  /** data:image/png;base64,... — ready to drop into <img src="">. */
  verifyQrDataUrl: string | null;
}

/**
 * Pre-allocate the jobId and generate the QR data URL.
 *
 * baseUrl is the public-facing base (e.g. https://erp.example.com).
 * If empty, the URL is a relative path which still verifies when the
 * scanner is on the same domain; if you serve printed documents to
 * external parties, set config.publicBaseUrl to the full origin.
 */
export async function buildVerifyContext(opts: { baseUrl: string }): Promise<VerifyContext> {
  const jobId = randomUUID();
  const path = `/api/print/verify/${jobId}`;
  const verifyUrl = opts.baseUrl ? `${opts.baseUrl.replace(/\/$/, "")}${path}` : path;
  let dataUrl: string | null = null;
  try {
    // 160px QR is the same size ZATCA uses for invoice QR — fits in a
    // letterhead corner without dominating the page. errorCorrectionLevel
    // M is the default, balances density vs. resilience.
    dataUrl = await QRCode.toDataURL(verifyUrl, { width: 160, margin: 1 });
  } catch (err) {
    // QR is decorative — if it fails (out of memory, unsupported chars),
    // the jobId + verifyUrl still get baked into the doc as text and the
    // verification endpoint still works.
    logger.warn(err as Error, "[print/verify] QR generation failed; falling back to text");
  }
  return { jobId, verifyUrl, verifyQrDataUrl: dataUrl };
}
