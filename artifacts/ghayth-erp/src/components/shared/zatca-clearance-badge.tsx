import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, Clock, XCircle, FileWarning } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ZATCA clearance / reporting status badge for invoice and expense
 * detail pages.
 *
 * The status string comes from the API (`invoices.zatcaClearanceStatus`
 * or `journal_entries.zatcaStatus`) and maps to the canonical
 * ClearanceResult states used by the Phase 2 client:
 *
 *   cleared  — Standard B2B invoice cleared by ZATCA (production)
 *   reported — Simplified B2C invoice reported (production)
 *   warning  — Cleared but with validation warnings the seller
 *               should fix before the next spec rev
 *   pending  — Submitted, waiting on ZATCA / in retry queue
 *   rejected — Validation errors; not cleared
 *   error    — Transport / config failure (network, expired cert)
 *
 * Each state gets a distinct icon + tone so the operator can scan a
 * list of invoices and see at a glance which ones need attention.
 */

type ZatcaStatus =
  | "cleared"
  | "reported"
  | "warning"
  | "pending"
  | "rejected"
  | "error"
  | string;

interface ZatcaClearanceBadgeProps {
  status: ZatcaStatus | null | undefined;
  /** Optional environment qualifier for the tooltip / aria-label. */
  environment?: "sandbox" | "production";
  /** Inline (compact) variant for table cells. Default: false (chunkier). */
  compact?: boolean;
  className?: string;
}

const STATE = {
  cleared: {
    label: "تم الترحيل",
    icon: CheckCircle2,
    classes: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  reported: {
    label: "تم الإبلاغ",
    icon: CheckCircle2,
    classes: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  warning: {
    label: "ترحيل مع تنبيهات",
    icon: FileWarning,
    classes: "bg-amber-50 text-amber-700 border-amber-200",
  },
  pending: {
    label: "قيد المعالجة",
    icon: Clock,
    classes: "bg-blue-50 text-blue-700 border-blue-200",
  },
  rejected: {
    label: "مرفوضة",
    icon: XCircle,
    classes: "bg-rose-50 text-rose-700 border-rose-200",
  },
  error: {
    label: "خطأ في الاتصال",
    icon: AlertTriangle,
    classes: "bg-rose-50 text-rose-700 border-rose-200",
  },
} as const;

export function ZatcaClearanceBadge({
  status,
  environment,
  compact = false,
  className,
}: ZatcaClearanceBadgeProps) {
  const state = resolveState(status);
  if (!state) return null;
  const Icon = state.icon;

  const envSuffix = environment === "sandbox" ? " — تجريبي" : "";
  const ariaLabel = `حالة الفوترة الإلكترونية: ${state.label}${envSuffix}`;

  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1.5 font-medium",
        state.classes,
        compact ? "h-5 px-1.5 text-xs" : "h-6 px-2 text-xs",
        className,
      )}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {state.label}
      {environment === "sandbox" && !compact ? (
        <span className="text-[10px] opacity-70">(تجريبي)</span>
      ) : null}
    </Badge>
  );
}

function resolveState(raw: ZatcaStatus | null | undefined) {
  if (!raw) return null;
  // Normalise: accept both lowercase canonical and the legacy
  // SCREAMING_CASE strings the existing route handler stores
  // (e.g. "CLEARED", "NOT_CLEARED", "REPORTED").
  const key = raw.toString().toLowerCase();

  if (key === "cleared" || key === "accepted") return STATE.cleared;
  if (key === "reported") return STATE.reported;
  if (key === "warning") return STATE.warning;
  if (key === "pending" || key === "submitted") return STATE.pending;
  if (key === "rejected" || key === "not_cleared" || key === "not_reported") return STATE.rejected;
  if (key === "error") return STATE.error;

  // Unknown status — render in a neutral tone so the user still gets
  // the raw value rather than a silent absence.
  return {
    label: raw.toString(),
    icon: AlertTriangle,
    classes: "bg-slate-50 text-slate-700 border-slate-200",
  };
}
