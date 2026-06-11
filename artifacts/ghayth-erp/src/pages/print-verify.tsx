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

// Mirror of artifacts/api-server/src/lib/print/templateResolver.ts:ARABIC_TITLES
// so a regulator scanning the QR sees the Arabic label of any entity the
// engine can print — not just the 13 commercial doc types this page first
// shipped with. Anything missing falls back to the raw entityType.
const ENTITY_TITLES_AR: Record<string, string> = {
  // Sales / commercial
  invoice: "فاتورة ضريبية",
  sales_invoice: "فاتورة مبيعات",
  credit_note: "إشعار دائن",
  debit_note: "إشعار مدين",
  pos_receipt: "إيصال نقطة بيع",
  receipt_voucher: "سند قبض",
  payment_voucher: "سند صرف",
  voucher: "سند",
  quotation: "عرض سعر",
  sales_order: "أمر بيع",
  delivery_note: "إذن تسليم",
  // Purchasing
  purchase_order: "أمر شراء",
  purchase_request: "طلب شراء",
  goods_receipt: "إيصال استلام بضاعة",
  // GL / finance
  journal_entry: "قيد محاسبي",
  recurring_journal: "قيد متكرر",
  account_statement: "كشف حساب",
  customer_statement: "كشف حساب عميل",
  vendor_statement: "كشف حساب مورّد",
  expense: "مصروف",
  expense_claim: "مطالبة مصروف",
  budget: "موازنة",
  custody: "عهدة",
  // Warehouse
  stock_transfer: "تحويل مخزون",
  stock_adjustment: "تسوية مخزون",
  inventory_count: "جرد مخزون",
  item_barcode_label: "ملصق باركود",
  warehouse_product: "بطاقة منتج",
  warehouse_category: "تصنيف مستودع",
  // HR
  leave_request: "طلب إجازة",
  leave: "طلب إجازة",
  loan_request: "طلب قرض",
  loan: "قرض موظف",
  maintenance_request: "طلب صيانة",
  maintenance: "طلب صيانة",
  payroll: "كشف رواتب",
  payroll_run: "كشف رواتب",
  payslip: "قسيمة راتب",
  official_letter: "خطاب رسمي",
  employee_contract: "عقد عمل",
  employee: "بطاقة موظف",
  employee_profile: "بطاقة موظف",
  overtime_request: "طلب عمل إضافي",
  overtime: "طلب عمل إضافي",
  exit_request: "طلب إنهاء خدمة",
  evaluation_360: "تقييم 360°",
  evaluation_cycle: "تقييم 360°",
  training: "دورة تدريبية",
  training_program: "برنامج تدريبي",
  discipline_memo: "مذكرة إنذار",
  attendance: "سجل حضور",
  excuse: "عذر",
  excuse_request: "طلب استئذان",
  performance: "تقييم أداء",
  performance_review: "تقييم أداء",
  salary_advance: "سلفة راتب",
  shift: "وردية عمل",
  transfer: "تحويل",
  job: "وظيفة شاغرة",
  job_posting: "إعلان وظيفي",
  application: "طلب توظيف",
  // Fleet
  vehicle: "بطاقة مركبة",
  fleet_trip: "كشف رحلة",
  trip: "رحلة أسطول",
  driver: "سائق",
  fuel: "تعبئة وقود",
  fuel_log: "تعبئة وقود",
  fleet_maintenance: "صيانة مركبة",
  insurance: "وثيقة تأمين",
  insurance_policy: "وثيقة تأمين",
  traffic_violation: "مخالفة مرورية",
  violation: "مخالفة",
  // Properties
  rental_contract: "عقد إيجار",
  contract: "عقد إيجار",
  property_unit: "بطاقة وحدة عقارية",
  unit: "وحدة عقارية",
  tenant: "بطاقة مستأجر",
  building: "بطاقة مبنى",
  property: "بطاقة عقار",
  owner: "بطاقة مالك",
  // Legal
  legal_contract: "عقد قانوني",
  legal_judgment: "ملف قضية",
  legal_case: "ملف قضية",
  legal_session: "محضر جلسة",
  // CRM / Sales
  client: "بطاقة عميل",
  customer: "بطاقة عميل",
  crm_lead: "عميل محتمل",
  opportunity: "فرصة CRM",
  crm_opportunity: "فرصة CRM",
  support_ticket: "تذكرة دعم",
  ticket: "تذكرة دعم",
  campaign: "حملة تسويقية",
  vendor: "بطاقة مورّد",
  supplier: "بطاقة مورّد",
  fixed_asset: "بطاقة أصل ثابت",
  project: "مشروع",
  project_costing: "تكلفة مشروع",
  store_order: "طلب متجر",
  store_product: "منتج متجر",
  product: "بطاقة منتج",
  // Umrah
  umrah_invoice: "فاتورة عمرة",
  umrah_statement: "كشف وكيل عمرة",
  umrah_runsheet: "كشف اليوم — عمرة",
  umrah_agent: "وكيل عمرة",
  agent: "وكيل عمرة",
  umrah_sub_agent: "وكيل عمرة فرعي",
  sub_agent: "وكيل فرعي",
  umrah_pilgrim: "معتمر",
  pilgrim: "بطاقة معتمر",
  mutamer: "بطاقة معتمر",
  umrah_package: "باقة عمرة",
  umrah_season: "موسم عمرة",
  season: "موسم عمرة",
  umrah_transport: "نقل عمرة",
  transport: "نقل عمرة",
  umrah_penalty: "عقوبة عمرة",
  umrah_violation: "مخالفة عمرة",
  // Governance
  governance_policy: "سياسة حوكمة",
  policy: "سياسة",
  risk: "مخاطرة",
  compliance: "التزام تنظيمي",
  audit: "سجل تدقيق",
  audit_record: "سجل تدقيق",
  // Misc
  task: "مهمة",
  request: "طلب",
  account: "حساب",
  chart_of_account: "بطاقة حساب",
  correspondence: "مراسلة رسمية",
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
                  ? "جاري التحقق..."
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
