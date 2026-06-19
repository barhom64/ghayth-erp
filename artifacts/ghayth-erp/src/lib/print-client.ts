/**
 * Print SDK — frontend wrapper around the Print Platform API.
 *
 * Phase 1 of the Print Platform roadmap. PrintButton and any other UI
 * that needs to print should call these helpers, not the low-level API
 * helper directly — that way the contract surface lives in one place and we can
 * evolve it (add caching, retries, observability) without touching every
 * page.
 *
 *   renderDocument()     POST /print/render            → bytes for inline preview
 *   previewDocument()    POST /print/preview            → bytes, no audit, ephemeral
 *   downloadDocument()   wraps renderDocument + saves   → file appears in Downloads
 *   verifyDocument()     GET  /print/verify/:jobId      → audit-row check (no auth)
 *   listJobs()           GET  /print/jobs               → audit log query
 *   listTemplates()      GET  /print/templates          → template catalog
 *
 * Direct browser-side document generation is forbidden by the
 * `direct-pdf-generation` lint rule (docs/architecture/print-platform.md).
 */

import { apiFetch, ApiError, API_BASE } from "@/lib/api";

export type PrintFormat = "a4" | "thermal_80" | "thermal_58" | "label" | "excel" | "csv";

export type PaperSize =
  | "A4"
  | "A5"
  | "THERMAL_80"
  | "THERMAL_58"
  | "LABEL_50x30"
  | "LABEL_100x50";

export interface PrintRenderInput {
  entityType: string;
  entityId: string | number;
  format?: PrintFormat;
  paperSize?: PaperSize;
  /** When true the server returns inline bytes via Content-Type. We default
   *  to false (JSON envelope with base64) so the SDK can decode safely
   *  through TextDecoder — see #1085 for the UTF-8 mojibake history. */
  inline?: boolean;
  /** Caller-supplied data — when present, the server skips the dataLoader
   *  and renders this directly. Used by ListPage to export visible rows
   *  (no real entityId), and by future AI flows that pass a generated body.
   *  Shape: { entity: {...}, items?: [...], client?: {...}, ... }. */
  payload?: Record<string, unknown>;
}

export interface PrintRenderResponse {
  jobId: string | null;
  format: PrintFormat;
  mime: string;
  filename: string;
  copyNumber: number;
  isReprint: boolean;
  watermark?: string | null;
  storageKey?: string | null;
  /** base64-encoded document bytes — decode with `base64ToUint8Array` +
   *  TextDecoder("utf-8") before display so Arabic doesn't mojibake. */
  base64: string;
}

export interface PrintVerifyResponse {
  verified: boolean;
  jobId?: string;
  entityType?: string;
  entityId?: string;
  copyNumber?: number;
  isReprint?: boolean;
  printedAt?: string;
  issuer?: { company: string | null; branch: string | null };
  status?: string;
  message?: string;
  error?: string;
}

export interface PrintJobRow {
  id: number;
  jobId: string;
  entityType: string;
  entityId: string;
  format: string;
  paperSize: string | null;
  copyNumber: number;
  isReprint: boolean;
  watermark: string | null;
  status: string;
  createdAt: string;
  pdfStorageKey: string | null;
  branchName: string | null;
  userEmail: string | null;
  userName: string | null;
}

export interface PrintTemplateRow {
  id: number;
  name: string;
  entityType: string;
  branchId: number | null;
  paperSize: string;
  mode: "preset" | "html" | "visual";
  isDefault: boolean;
}

/**
 * Server-side render. Returns the JSON envelope with base64 bytes —
 * the caller decodes via `decodeRenderResponse()` (or PrintButton flows
 * the bytes into a popup window).
 */
export async function renderDocument(input: PrintRenderInput): Promise<PrintRenderResponse> {
  return apiFetch<PrintRenderResponse>(`/print/render`, {
    method: "POST",
    body: JSON.stringify({
      entityType: input.entityType,
      entityId: String(input.entityId),
      format: input.format,
      paperSize: input.paperSize,
      inline: input.inline ?? false,
      payload: input.payload,
    }),
  });
}

/**
 * Ephemeral render — no audit row, no copy counter, no watermark.
 * Used by template designers to preview unsaved drafts without
 * polluting print_jobs.
 */
export async function previewDocument(input: {
  entityType: string;
  entityId?: string | number;
  templateId?: number;
  format?: PrintFormat;
  payload?: Record<string, unknown>;
}): Promise<Blob> {
  // Preview returns the bytes directly (not base64), since it bypasses
  // the audit envelope. We hit the endpoint with fetch directly because
  // apiFetch parses JSON by default.
  const res = await fetch(`${API_BASE}/api/print/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": readCsrf() ?? "" },
    credentials: "include",
    body: JSON.stringify({
      entityType: input.entityType,
      entityId: input.entityId !== undefined ? String(input.entityId) : undefined,
      templateId: input.templateId,
      format: input.format,
      payload: input.payload,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(text || `preview failed (${res.status})`, {
      status: res.status,
      code: "PREVIEW_FAILED",
    });
  }
  return await res.blob();
}

/**
 * Render and trigger a browser download (Save As…) instead of opening a
 * print dialog. Useful for Excel exports and for users who want to email
 * the file instead of printing it.
 */
export async function downloadDocument(input: PrintRenderInput): Promise<void> {
  const resp = await renderDocument(input);
  const bytes = base64ToUint8Array(resp.base64);
  // Explicit charset on the mime type so the browser doesn't guess — same
  // reasoning as the popup fallback in print-button.tsx (#1085).
  const mime = resp.mime.includes("charset") ? resp.mime : `${resp.mime.split(";")[0]};charset=utf-8`;
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = resp.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Public verification — anyone with a scanned QR can hit this without
 * an ERP account. The endpoint is unauthenticated and rate-limited
 * 60/min/IP server-side. Returns the audit-row subset for the print job
 * if it exists.
 */
export async function verifyDocument(jobId: string): Promise<PrintVerifyResponse> {
  const res = await fetch(`${API_BASE}/api/print/verify/${encodeURIComponent(jobId)}`);
  const body = (await res.json().catch(() => ({}))) as PrintVerifyResponse;
  return body;
}

/**
 * Audit-log query — returns the recent print_jobs rows scoped to the
 * caller's company. Filterable by entityType / entityId / userId / date.
 */
export async function listJobs(opts: {
  entityType?: string;
  entityId?: string | number;
  userId?: number;
  branchId?: number | null;
  from?: string;
  to?: string;
  limit?: number;
} = {}): Promise<{ items: PrintJobRow[] }> {
  const q = new URLSearchParams();
  if (opts.entityType) q.set("entityType", opts.entityType);
  if (opts.entityId !== undefined) q.set("entityId", String(opts.entityId));
  if (opts.userId !== undefined) q.set("userId", String(opts.userId));
  if (opts.branchId !== undefined && opts.branchId !== null) q.set("branchId", String(opts.branchId));
  if (opts.from) q.set("from", opts.from);
  if (opts.to) q.set("to", opts.to);
  if (opts.limit !== undefined) q.set("limit", String(opts.limit));
  return apiFetch<{ items: PrintJobRow[] }>(`/print/jobs?${q.toString()}`);
}

/**
 * Template catalog — what's available for an entityType (or all, if
 * unspecified). Useful for the template-editor "duplicate from…" UI.
 */
export async function listTemplates(opts: {
  entityType?: string;
  branchId?: number | null;
} = {}): Promise<{ items: PrintTemplateRow[] }> {
  const q = new URLSearchParams();
  if (opts.entityType) q.set("entityType", opts.entityType);
  if (opts.branchId === null) q.set("branchId", "null");
  else if (opts.branchId !== undefined) q.set("branchId", String(opts.branchId));
  return apiFetch<{ items: PrintTemplateRow[] }>(`/print/templates?${q.toString()}`);
}

/**
 * Decode the JSON envelope's base64 bytes into a UTF-8 string. Use for
 * HTML formats — Excel needs raw bytes (use `decodeRenderResponseBytes`).
 */
export function decodeRenderResponse(resp: PrintRenderResponse): string {
  const bytes = base64ToUint8Array(resp.base64);
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Decode the JSON envelope's base64 into raw bytes — Excel / future PDF
 * formats that aren't valid UTF-8 use this path.
 */
export function decodeRenderResponseBytes(resp: PrintRenderResponse): Uint8Array {
  return base64ToUint8Array(resp.base64);
}

/**
 * logClientPrint — records a client-side browser-print event in print_jobs so
 * BI analytics pages (bi-admin-reports, bi-operations) have an audit trail.
 * Call this before triggering the native browser print dialog.
 * Fire-and-forget: errors are swallowed so the print is never blocked.
 * GAP_MATRIX P0 — Ctrl+P prints on BI dashboards were previously untracked.
 */
export async function logClientPrint(entityType: string, entityId?: number | null): Promise<void> {
  apiFetch(`/api/print/log-client-print`, {
    method: "POST",
    body: JSON.stringify({ entityType, entityId: entityId ?? null, format: "window_print" }),
  }).catch(() => {});
}

// ─── internals ────────────────────────────────────────────────────────────

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function readCsrf(): string | null {
  const m = document.cookie.match(/(?:^|; )erp_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
