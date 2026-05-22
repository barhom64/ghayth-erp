/**
 * Print Engine v2 — shared types
 * See artifacts/api-server/src/migrations/171_print_engine_foundations.sql
 */

export type PrintFormat = "a4" | "thermal_80" | "thermal_58" | "label" | "excel";

export type PaperSize =
  | "A4"
  | "A5"
  | "THERMAL_80"
  | "THERMAL_58"
  | "LABEL_50x30"
  | "LABEL_100x50";

export type TemplateMode = "preset" | "html" | "visual";

export interface BranchLetterhead {
  companyName: string;
  branchName: string;
  branchNameEn?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  taxNumber?: string;
  crNumber?: string;
  logoUrl?: string;
  footerText?: string;
}

export interface PrintTemplate {
  id: number;
  name: string;
  entityType: string | null;
  branchId: number | null;
  companyId: number | null;
  paperSize: PaperSize;
  mode: TemplateMode;
  presetKey: string | null;
  htmlContent: string | null;
  layoutJson: unknown;
  cssOverrides: string | null;
  headerOverride: unknown;
  footerOverride: unknown;
  isThermal: boolean;
  version: number;
}

export interface PrintRenderRequest {
  entityType: string;
  entityId: string;
  format?: PrintFormat;
  paperSize?: PaperSize;
  copyNumber?: number;
  isReprint?: boolean;
  reprintApprovedBy?: number | null;
  /** Optional preview payload — when present we skip the data loader. */
  previewPayload?: Record<string, unknown>;
  /** When true, do not persist a print_jobs row (used for live preview). */
  ephemeral?: boolean;
  /** Optional override template (e.g. unsaved draft from the editor). */
  overrideTemplate?: PrintTemplate;
}

export interface PrintRenderResult {
  jobId: string | null;
  format: PrintFormat;
  mime: string;
  filename: string;
  bytes: Buffer;
  storageKey?: string | null;
  copyNumber: number;
  isReprint: boolean;
  watermark?: string;
}

export interface RenderContext {
  companyId: number;
  branchId: number | null;
  userId: number;
  branch: BranchLetterhead;
  company: { id: number; name: string; nameEn?: string; logoUrl?: string };
  template: PrintTemplate;
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
  format: PrintFormat;
  paperSize: PaperSize;
  copyNumber: number;
  watermark?: string;
}

export interface FormatAdapter {
  format: PrintFormat;
  render(ctx: RenderContext): Promise<{ bytes: Buffer; mime: string; filename: string }>;
}

export interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
}
