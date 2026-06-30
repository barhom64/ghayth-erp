import { useState, useEffect, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

/**
 * مُمكِّن حوارات الإشعارات (دائن/مدين) — مصدر واحد للأجزاء المتطابقة بين
 * `credit-memo-dialog` و`debit-memo-dialog`: جلب المعاينة المؤجَّل، شريط
 * الجاهزية، قائمة الموانع، شبكة المبالغ، وجدول القيد المُولّد. توحيد بصري
 * مطابق حرفيًا لما كان مكرَّرًا، يمنع انحراف النسختين.
 */

export interface MemoJournalLine {
  accountCode: string;
  debit: number;
  credit: number;
  description: string;
}
export interface MemoTotals { debit: number; credit: number; balanced: boolean }
export interface MemoBlocker { field?: string; message: string }

/** جلب معاينة الإشعار مع تأجيل 300ms وإلغاء آمن — مشترك بين النسختين. */
export function useMemoPreview<T>(opts: {
  open: boolean;
  endpoint: string;
  amount: string;
  vatIncluded: boolean;
  memoDate: string;
}) {
  const { open, endpoint, amount, vatIncluded, memoDate } = opts;
  const [preview, setPreview] = useState<T | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const n = Number(amount);
    if (!n || n <= 0) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setPreviewing(true);
      setPreviewError(null);
      try {
        const res = await apiFetch<T>(endpoint, {
          method: "POST",
          body: JSON.stringify({ amount: n, vatIncluded, memoDate }),
        });
        if (cancelled) return;
        setPreview(res);
      } catch (err: any) {
        if (cancelled) return;
        setPreviewError(err?.message ?? "تعذّر حساب المعاينة");
        setPreview(null);
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [amount, vatIncluded, memoDate, open, endpoint]);

  return { preview, previewing, previewError, setPreview };
}

/** حالة المعاينة: مؤشّر التحميل أو رسالة الخطأ. */
export function MemoPreviewState({
  previewing, previewError,
}: { previewing: boolean; previewError: string | null }) {
  return (
    <>
      {previewing && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-3">
          <Loader2 className="h-4 w-4 animate-spin" /> جاري حساب المعاينة...
        </div>
      )}
      {previewError && (
        <div className="mt-3 p-3 border border-destructive/40 bg-destructive/5 rounded text-sm text-destructive">
          {previewError}
        </div>
      )}
    </>
  );
}

/** شريط الجاهزية للإصدار، مع سطر فرعي اختياري (نسبة العكس مثلًا). */
export function MemoCanIssueBanner({
  canIssue, children,
}: { canIssue: boolean; children?: ReactNode }) {
  return (
    <div className={`p-3 rounded border flex items-start gap-2 ${
      canIssue ? "bg-emerald-50/40 border-emerald-300" : "bg-destructive/5 border-destructive/40"
    }`}>
      {canIssue
        ? <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
        : <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />}
      <div className="text-sm">
        <p className={`font-bold ${canIssue ? "text-emerald-700" : "text-destructive"}`}>
          {canIssue ? "جاهز للإصدار" : "لا يمكن الإصدار — راجع المشاكل أدناه"}
        </p>
        {children}
      </div>
    </div>
  );
}

/** قائمة الموانع التي تمنع الإصدار. */
export function MemoBlockersList({ blockers }: { blockers: MemoBlocker[] }) {
  if (blockers.length === 0) return null;
  return (
    <div className="border border-destructive/40 rounded p-3 bg-destructive/5">
      <p className="text-xs font-semibold text-destructive mb-1">مشاكل تمنع الإصدار:</p>
      <ul className="text-xs space-y-1">
        {blockers.map((b, i) => (
          <li key={i} className="text-destructive flex items-start gap-1">
            <span>•</span><span>{b.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** شبكة المبالغ الثلاثة: صافي / ضريبة / الإجمالي. */
export function MemoAmountsGrid({
  netAmount, vatAmount, total, totalLabel = "إجمالي الإشعار",
}: { netAmount: number; vatAmount: number; total: number; totalLabel?: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-xs">
      <div className="p-2 rounded bg-muted">
        <p className="text-muted-foreground">صافي</p>
        <p className="font-mono font-bold">{formatCurrency(netAmount)}</p>
      </div>
      <div className="p-2 rounded bg-status-info-surface text-status-info-foreground">
        <p className="opacity-70">ضريبة</p>
        <p className="font-mono font-bold">{formatCurrency(vatAmount)}</p>
      </div>
      <div className="p-2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
        <p className="opacity-70">{totalLabel}</p>
        <p className="font-mono font-bold">{formatCurrency(total)}</p>
      </div>
    </div>
  );
}

/** جدول القيد المحاسبي المُولّد + صف الإجمالي وشارة التوازن. */
export function MemoJournalPreview({
  journalLines, totals,
}: { journalLines: MemoJournalLine[]; totals: MemoTotals }) {
  return (
    <div className="border rounded">
      <p className="text-xs font-semibold p-2 border-b bg-muted">
        القيد المحاسبي المُولّد ({journalLines.length} سطر)
        <Badge className="ms-2" variant={totals.balanced ? "default" : "destructive"}>
          {totals.balanced ? "متوازن" : "غير متوازن"}
        </Badge>
      </p>
      <div className="text-xs">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="text-muted-foreground bg-muted/50">
              <tr>
                <th className="text-start p-2 font-medium">الحساب</th>
                <th className="text-start p-2 font-medium">البيان</th>
                <th className="text-end p-2 font-medium">مدين</th>
                <th className="text-end p-2 font-medium">دائن</th>
              </tr>
            </thead>
            <tbody>
              {journalLines.map((l, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2 font-mono">{l.accountCode}</td>
                  <td className="p-2 text-muted-foreground">{l.description}</td>
                  <td className="p-2 text-end font-mono">{l.debit > 0 ? formatCurrency(l.debit) : "—"}</td>
                  <td className="p-2 text-end font-mono">{l.credit > 0 ? formatCurrency(l.credit) : "—"}</td>
                </tr>
              ))}
              <tr className="border-t bg-muted/30 font-bold">
                <td className="p-2" colSpan={2}>الإجمالي</td>
                <td className="p-2 text-end font-mono">{formatCurrency(totals.debit)}</td>
                <td className="p-2 text-end font-mono">{formatCurrency(totals.credit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
