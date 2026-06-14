import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle, Info, XCircle, Eye, Loader2 } from "lucide-react";

interface ImpactItem {
  category: string;
  label: string;
  value: string;
  severity: "info" | "warning" | "danger" | "success";
}

// #2238 (FIN-P8-JOURNAL-PREVIEW) — the REAL journal plan a finance create page
// receives alongside the text impacts: debit/credit lines + dimensions +
// integrity verdict, built by the backend through the same resolver the save
// path uses. Optional — only the finance expense preview returns it today; the
// other consumers (hr/projects/properties/warehouse/invoices…) keep returning
// just `items[]` so this upgrade is backward-compatible.
export interface JournalPreviewLineView {
  lineNo: number;
  accountCode: string;
  accountName: string | null;
  debit: number;
  credit: number;
  role: string;
  dimensions: Record<string, unknown>;
  derivationReason: string;
  accountSource: "manual" | "mapping" | "purpose" | "fallback" | "selected";
  status: "ok" | "account_not_found" | "dimension_missing";
}
export interface JournalPreview {
  ready: boolean;
  incompleteReason?: string;
  lines: JournalPreviewLineView[];
  totals: { debit: number; credit: number };
  balanced: boolean;
  blockers: { code: string; field?: string; message: string }[];
  warnings: string[];
  sourceContext: { paymentMethod: string | null; sourceAccountCode: string | null; sourceAccountName: string | null };
  suggestedDocumentStatus?: string;
  suggestedPaymentStatus?: string;
  suggestedPostingStatus?: string;
}

interface ImpactPreview {
  actionType: string;
  employeeId: number;
  employeeName: string;
  items: ImpactItem[];
  summary: string;
  // #1945 (owner review #3) — the resolved suggested posting account, so a
  // form can pre-fill it as the real default at save (not just a text hint).
  suggestedAccountCode?: string | null;
  suggestedCapitalize?: boolean;
  // #2238 — the real journal preview (debit/credit table + integrity verdict).
  journalPreview?: JournalPreview | null;
}

const ACCOUNT_SOURCE_LABELS: Record<string, string> = {
  manual: "اختيار يدوي",
  mapping: "قاعدة توجيه",
  purpose: "غرض الحساب",
  fallback: "افتراضي (راجع)",
  selected: "مصدر مُختار",
};

const DIMENSION_LABELS_AR: Record<string, string> = {
  vehicleId: "مركبة",
  propertyId: "عقار",
  projectId: "مشروع",
  vendorId: "مورد",
  clientId: "عميل",
  unitId: "وحدة",
  assetId: "أصل",
  contractId: "عقد",
  employeeId: "موظف",
  costCenterId: "مركز تكلفة",
  costCenter: "مركز تكلفة",
};

function fmtMoney(n: number): string {
  return Number(n || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * #2238 — «معاينة القيد المحاسبي»: a real debit/credit table built from the
 * backend journal plan (NOT a frontend re-computation). Shows the derived
 * account + derivation reason + account source + dimensions per line, the
 * balance verdict, blockers (which gate save) and warnings. `mode="review"`
 * renders the same panel read-only for the future approval workspace.
 */
export function FinancialJournalPreviewPanel({ preview, mode = "input" }: { preview: JournalPreview; mode?: "input" | "review" }) {
  if (!preview.ready) {
    return (
      <div className="rounded-xl border border-dashed bg-surface-subtle p-4 text-sm text-muted-foreground flex items-center gap-2">
        <Info className="h-4 w-4" />
        {preview.incompleteReason || "أكمل البيانات المطلوبة لعرض القيد"}
      </div>
    );
  }
  const hasBlockers = preview.blockers.length > 0;
  return (
    <div className="rounded-xl border bg-surface-subtle p-4 space-y-3 text-sm">
      <div className="flex items-center gap-2">
        {hasBlockers ? <XCircle className="h-4 w-4 text-red-500" /> : preview.balanced ? <CheckCircle className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-yellow-500" />}
        <p className="font-semibold text-gray-800">معاينة القيد المحاسبي{mode === "review" ? " (مراجعة)" : ""}</p>
        <span className={cn("ms-auto text-xs rounded-full px-2 py-0.5 border", preview.balanced ? "border-status-success-surface text-status-success-foreground bg-status-success-surface" : "border-status-error-surface text-status-error-foreground bg-status-error-surface")}>
          {preview.balanced ? "متوازن" : "غير متوازن"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-muted-foreground border-b">
              <th className="text-start p-1.5">#</th>
              <th className="text-start p-1.5">الحساب</th>
              <th className="text-start p-1.5">اسم الحساب</th>
              <th className="text-end p-1.5">مدين</th>
              <th className="text-end p-1.5">دائن</th>
              <th className="text-start p-1.5">الأبعاد</th>
              <th className="text-start p-1.5">سبب التوجيه</th>
              <th className="text-start p-1.5">المصدر</th>
              <th className="text-start p-1.5">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {preview.lines.map((l) => {
              const dims = Object.entries(l.dimensions);
              return (
                <tr key={l.lineNo} className={cn("border-b last:border-0", l.status !== "ok" && "bg-status-error-surface")}>
                  <td className="p-1.5">{l.lineNo}</td>
                  <td className="p-1.5 font-mono">{l.accountCode}</td>
                  <td className="p-1.5">{l.accountName || <span className="text-red-500">— غير موجود —</span>}</td>
                  <td className="p-1.5 text-end">{l.debit ? fmtMoney(l.debit) : ""}</td>
                  <td className="p-1.5 text-end">{l.credit ? fmtMoney(l.credit) : ""}</td>
                  <td className="p-1.5">
                    {dims.length === 0 ? <span className="text-muted-foreground">—</span> : dims.map(([k, v]) => (
                      <span key={k} className="inline-block rounded bg-surface px-1 me-1 border">{DIMENSION_LABELS_AR[k] || k}: {String(v)}</span>
                    ))}
                  </td>
                  <td className="p-1.5 text-muted-foreground">{l.derivationReason}</td>
                  <td className="p-1.5">
                    <span className={cn("rounded px-1 border", l.accountSource === "fallback" && "border-yellow-300 text-yellow-700 bg-status-warning-surface")}>
                      {ACCOUNT_SOURCE_LABELS[l.accountSource] || l.accountSource}
                    </span>
                  </td>
                  <td className="p-1.5">
                    {l.status === "ok" ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> :
                     l.status === "account_not_found" ? <span className="text-red-600">حساب غير موجود</span> :
                     <span className="text-red-600">بُعد ناقص</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold border-t">
              <td className="p-1.5" colSpan={3}>الإجمالي</td>
              <td className="p-1.5 text-end">{fmtMoney(preview.totals.debit)}</td>
              <td className="p-1.5 text-end">{fmtMoney(preview.totals.credit)}</td>
              <td className="p-1.5" colSpan={4}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {preview.blockers.length > 0 && (
        <div className="rounded-lg border border-status-error-surface bg-status-error-surface p-2.5 space-y-1">
          {preview.blockers.map((b, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-status-error-foreground">
              <XCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /><span>{b.message}</span>
            </div>
          ))}
        </div>
      )}

      {preview.warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-status-warning-surface p-2.5 space-y-1">
          {preview.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-yellow-700">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /><span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SEVERITY_STYLES: Record<string, { bg: string; text: string; icon: any }> = {
  info: { bg: "bg-status-info-surface border-status-info-surface", text: "text-status-info-foreground", icon: Info },
  warning: { bg: "bg-status-warning-surface border-yellow-200", text: "text-yellow-700", icon: AlertTriangle },
  danger: { bg: "bg-status-error-surface border-status-error-surface", text: "text-status-error-foreground", icon: XCircle },
  success: { bg: "bg-status-success-surface border-status-success-surface", text: "text-status-success-foreground", icon: CheckCircle },
};

interface ImpactPreviewButtonProps {
  endpoint: string;
  payload: Record<string, any>;
  label?: string;
  onImpactLoaded?: (impact: ImpactPreview) => void;
}

export function ImpactPreviewButton({ endpoint, payload, label = "معاينة الأثر", onImpactLoaded }: ImpactPreviewButtonProps) {
  const [impact, setImpact] = useState<ImpactPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(false);

  const loadImpact = async () => {
    if (shown && impact) { setShown(false); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<ImpactPreview>(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setImpact(result);
      setShown(true);
      onImpactLoaded?.(result);
    } catch (err: any) {
      setError(err.message || "خطأ في التحميل");
    } finally {
      setLoading(false);
    }
  };

  const hasDanger = impact?.items.some(i => i.severity === "danger");
  const hasWarning = impact?.items.some(i => i.severity === "warning");

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={loadImpact}
        disabled={loading}
        className={cn(
          "gap-1.5",
          hasDanger && shown ? "border-status-error-surface text-status-error-foreground hover:bg-status-error-surface" :
          hasWarning && shown ? "border-yellow-300 text-yellow-600 hover:bg-status-warning-surface" :
          "border-status-info-surface text-status-info-foreground hover:bg-status-info-surface"
        )}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
        {label}
      </Button>

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      {shown && impact && (
        <ImpactPreviewPanel impact={impact} />
      )}
    </div>
  );
}

/**
 * Live, always-on variant (#1715 owner feedback): auto-fetches the impact
 * (debounced) whenever the payload changes and renders the panel inline — so
 * the «التوجيه المحاسبي المتوقّع» is visible under the operation without a click.
 */
export function LiveImpactPreview({ endpoint, payload, enabled = true, onResult }: { endpoint: string; payload: Record<string, any>; enabled?: boolean; onResult?: (r: ImpactPreview) => void }) {
  const [impact, setImpact] = useState<ImpactPreview | null>(null);
  const key = JSON.stringify(payload);
  useEffect(() => {
    if (!enabled) { setImpact(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const result = await apiFetch<ImpactPreview>(endpoint, { method: "POST", body: JSON.stringify(payload) });
        if (!cancelled) { setImpact(result); onResult?.(result); }
      } catch {
        if (!cancelled) setImpact(null);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
    // key captures the payload contents; endpoint + enabled complete the deps.
  }, [endpoint, key, enabled]);
  if (!enabled || !impact) return null;
  return <ImpactPreviewPanel impact={impact} />;
}

export function ImpactPreviewPanel({ impact }: { impact: ImpactPreview }) {
  const hasDanger = impact.items.some(i => i.severity === "danger");
  const hasWarning = impact.items.some(i => i.severity === "warning");

  const summaryStyle = hasDanger ? "bg-status-error-surface border-status-error-surface text-status-error-foreground"
    : hasWarning ? "bg-status-warning-surface border-yellow-300 text-yellow-700"
    : "bg-status-success-surface border-status-success-surface text-status-success-foreground";

  const groupedItems = impact.items.reduce((acc: Record<string, ImpactItem[]>, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {/* #2238 — when the backend returns a real journal plan, show the
          «معاينة القيد المحاسبي» table ABOVE the text impacts (the table is the
          primary surface; the text impacts stay as supporting context). */}
      {impact.journalPreview && <FinancialJournalPreviewPanel preview={impact.journalPreview} />}

    <div className="rounded-xl border bg-surface-subtle p-4 space-y-3 text-sm">
      <div className="flex items-center gap-2">
        {hasDanger ? <XCircle className="h-4 w-4 text-red-500" /> :
         hasWarning ? <AlertTriangle className="h-4 w-4 text-yellow-500" /> :
         <CheckCircle className="h-4 w-4 text-green-500" />}
        <p className="font-semibold text-gray-800">ماذا سيحدث إذا اعتمدت؟</p>
      </div>

      {Object.entries(groupedItems).map(([cat, items]) => (
        <div key={cat}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{cat}</p>
          <div className="space-y-1.5">
            {items.map((item, idx) => {
              const style = SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.info;
              const Icon = style.icon;
              return (
                <div key={idx} className={cn("flex items-start gap-2 rounded-lg border p-2.5", style.bg)}>
                  <Icon className={cn("h-3.5 w-3.5 mt-0.5 flex-shrink-0", style.text)} />
                  <div className="min-w-0">
                    <span className={cn("text-xs font-medium", style.text)}>{item.label}: </span>
                    <span className="text-xs text-muted-foreground">{item.value}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className={cn("rounded-lg border px-3 py-2 text-xs font-medium", summaryStyle)}>
        الخلاصة: {impact.summary}
      </div>
    </div>
    </div>
  );
}
