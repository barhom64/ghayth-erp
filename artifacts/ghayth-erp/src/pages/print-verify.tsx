import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { CheckCircle2, XCircle, AlertCircle, Loader2, FileText, Building2, Calendar, Hash, RotateCw } from "lucide-react";
import { verifyDocument, type PrintVerifyResponse } from "@/lib/print-client";
import { formatDateAr } from "@/lib/formatters";

// Public verify page — accessible without an ERP login. Every PDF the engine
// emits carries a QR encoding /print/verify/<jobId>; scanning that QR opens
// this page, which hits /api/print/verify/:jobId (anonymous, rate-limited)
// and renders the audit-row subset in a human-friendly Arabic card. Without
// this page the same scan landed on raw JSON in the browser — fine for
// machines, useless for the regulator holding the doc.

const ENTITY_TITLES_AR: Record<string, string> = {
  invoice: "فاتورة ضريبية",
  sales_invoice: "فاتورة مبيعات",
  credit_note: "إشعار دائن",
  pos_receipt: "إيصال نقطة بيع",
  receipt_voucher: "سند قبض",
  payment_voucher: "سند صرف",
  quotation: "عرض سعر",
  sales_order: "أمر بيع",
  delivery_note: "إذن تسليم",
  purchase_order: "أمر شراء",
  purchase_request: "طلب شراء",
  goods_receipt: "إيصال استلام بضاعة",
  journal_entry: "قيد محاسبي",
};

export default function PrintVerifyPage() {
  const { jobId = "" } = useParams<{ jobId?: string }>();
  const [state, setState] = useState<{ loading: boolean; data: PrintVerifyResponse | null; error: string | null }>({
    loading: true,
    data: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await verifyDocument(jobId);
        if (!cancelled) setState({ loading: false, data, error: null });
      } catch {
        if (!cancelled) setState({ loading: false, data: null, error: "تعذّر الاتصال بخدمة التحقق" });
      }
    })();
    return () => { cancelled = true; };
  }, [jobId]);

  const verified = state.data?.verified === true;
  const entityLabel = state.data?.entityType ? (ENTITY_TITLES_AR[state.data.entityType] ?? state.data.entityType) : "وثيقة";

  return (
    <div dir="rtl" lang="ar" className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-lg border border-slate-200 overflow-hidden">
        <div className={`p-6 ${verified ? "bg-emerald-50 border-b border-emerald-200" : "bg-amber-50 border-b border-amber-200"}`}>
          <div className="flex items-center gap-3">
            {state.loading ? (
              <Loader2 className="h-10 w-10 text-slate-400 animate-spin" />
            ) : verified ? (
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            ) : state.data?.error === "NOT_FOUND" ? (
              <XCircle className="h-10 w-10 text-rose-600" />
            ) : (
              <AlertCircle className="h-10 w-10 text-amber-600" />
            )}
            <div>
              <h1 className="text-xl font-bold text-slate-800">
                {state.loading
                  ? "جارٍ التحقق..."
                  : verified
                  ? "وثيقة موثَّقة ✓"
                  : state.data?.error === "NOT_FOUND"
                  ? "وثيقة غير موجودة"
                  : state.data?.error === "INVALID_JOB_ID"
                  ? "رمز التحقق غير صالح"
                  : state.data?.message ?? "تعذّر التحقق من الوثيقة"}
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                {verified
                  ? "هذه الوثيقة صادرة عن نظام غيث ومسجّلة في سجلّ الطباعة الرسمي."
                  : "إذا كنت تظنّ أن هذا خطأ، تواصل مع الجهة المُصدِرة."}
              </p>
            </div>
          </div>
        </div>

        {verified && state.data && (
          <div className="p-6 space-y-3">
            <DetailRow icon={<FileText className="h-4 w-4" />} label="نوع الوثيقة" value={entityLabel} />
            <DetailRow icon={<Hash className="h-4 w-4" />} label="مرجع الوثيقة" value={state.data.entityId ?? "—"} mono />
            <DetailRow
              icon={<Calendar className="h-4 w-4" />}
              label="تاريخ الطباعة"
              value={state.data.printedAt ? formatDateAr(state.data.printedAt) : "—"}
            />
            <DetailRow icon={<Building2 className="h-4 w-4" />} label="الجهة المُصدِرة" value={state.data.issuer?.company ?? "—"} />
            {state.data.issuer?.branch && (
              <DetailRow icon={<Building2 className="h-4 w-4" />} label="الفرع" value={state.data.issuer.branch} />
            )}
            {state.data.copyNumber !== undefined && state.data.copyNumber > 1 && (
              <DetailRow
                icon={<RotateCw className="h-4 w-4 text-amber-600" />}
                label="رقم النسخة"
                value={`نسخة مكررة #${state.data.copyNumber}`}
                highlight
              />
            )}
            <div className="pt-3 mt-2 border-t border-slate-100">
              <div className="text-xs text-slate-500 mono" dir="ltr">معرّف العملية: {state.data.jobId}</div>
            </div>
          </div>
        )}

        {state.error && (
          <div className="p-6">
            <p className="text-sm text-rose-600">{state.error}</p>
          </div>
        )}

        <div className="bg-slate-50 border-t border-slate-100 px-6 py-3 text-center text-xs text-slate-500">
          صفحة تحقق علنية — نظام غيث للموارد المؤسسية
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  icon, label, value, mono, highlight,
}: { icon: React.ReactNode; label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 p-2 rounded ${highlight ? "bg-amber-50" : ""}`}>
      <div className="flex items-center gap-2 text-slate-600 text-sm">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`font-semibold text-slate-800 ${mono ? "font-mono text-sm" : ""}`} dir={mono ? "ltr" : "rtl"}>
        {value}
      </div>
    </div>
  );
}
