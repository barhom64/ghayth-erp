/**
 * مستندات الموردين — الموجة الثانية #2139 / مهمة #2140 (الشريحة 2).
 *
 * تكمل حلقة الذمم الدائنة من الواجهة: ثلاثة أنواع مستندات كانت خلفيتها
 * مكتملة (مرايا AP لمستندات العملاء، بنفس نموذج الترحيل والتسلسل) بلا
 * أي صفحة — مصنّفة «خدمة ناقصة» في docs/UNUSED_API_CLASSIFICATION:
 *
 *   دفعات مقدمة   GET|POST /finance/vendor-advances  + POST :id/apply (على أمر شراء)
 *   إشعارات دائنة GET|POST /finance/vendor-credits   + POST :id/apply (على أمر شراء)
 *   فواتير موردين GET|POST /finance/vendor-invoices  (قيد مصروف + ذمم دائنة)
 *
 * صفحة واحدة بثلاثة تبويبات لأن الثلاثة دورة عمل واحدة (مشتريات ← دفع
 * مسبق/فوترة/إرجاع) ولنفس الجمهور؛ كل تبويب: مؤشرات + فلتر حالة + بحث +
 * جدول + نموذج إنشاء سريع، والتطبيق على أمر شراء عبر حوار. بنية الجداول
 * والشارات على نمط الصفحة المرآة customer-advances.tsx.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GuardedButton } from "@/components/shared/permission-gate";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Wallet, Receipt, FileMinus, ArrowDownToLine, Search, ExternalLink,
} from "lucide-react";

// ── الأنواع (أعمدة الجداول الخلفية كما هي) ────────────────────────────
interface AdvanceRow {
  id: number; ref: string; supplierId: number; supplierName: string | null;
  amount: string | number; appliedAmount: string | number; method: string | null;
  paidDate: string | null; notes: string | null; status: string; journalId: number | null;
}
interface CreditRow {
  id: number; ref: string; supplierId: number; supplierName: string | null;
  amount: string | number; vatAmount: string | number; totalAmount: string | number;
  appliedAmount: string | number; memoDate: string | null; reason: string | null;
  status: string; journalId: number | null; poId: number | null;
}
interface VInvoiceRow {
  id: number; ref: string; supplierId: number; supplierName: string | null;
  invoiceDate: string | null; dueDate: string | null; poId: number | null;
  subtotal: string | number; vatAmount: string | number; total: string | number;
  paidAmount: string | number; description: string | null; status: string;
  journalId: number | null;
}

// المفردات مطابقة لما تكتبه المعالجات فعلاً (finance-purchase.ts):
// دفعات/إشعارات: open → applied (التطبيق الجزئي يبقي open والمبالغ تُظهره)؛
// فواتير الموردين: تُنشأ approved — لا انتقال سداد خلفي لها بعد (فجوة موثقة
// في تقرير الشريحة)، فالواجهة لا تخترع حالات سداد لا يكتبها الخادم.
const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  open:      { label: "مفتوحة",        tone: "bg-status-info-surface text-status-info-foreground" },
  applied:   { label: "مطبقة بالكامل", tone: "bg-emerald-50 text-emerald-700" },
  approved:  { label: "معتمدة",        tone: "bg-status-info-surface text-status-info-foreground" },
  paid:      { label: "مدفوعة",        tone: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "ملغاة",         tone: "bg-muted text-muted-foreground" },
};
const statusBadge = (s: string) => {
  const m = STATUS_LABEL[s] ?? { label: s, tone: "bg-muted" };
  return <Badge className={`text-xs ${m.tone}`}>{m.label}</Badge>;
};

const METHOD_LABEL: Record<string, string> = {
  cash: "نقدي", bank_transfer: "تحويل بنكي", check: "شيك", credit_card: "بطاقة ائتمان",
};

const journalLink = (id: number | null) =>
  id ? (
    <Link href={`/finance/journal/${id}`}>
      <Button variant="ghost" size="sm" className="h-7 gap-1">
        <ExternalLink className="h-3 w-3" />القيد
      </Button>
    </Link>
  ) : null;

export default function VendorDocumentsPage() {
  const { toast } = useToast();
  const initialTab =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tab") ?? "advances"
      : "advances";
  const [tab, setTab] = useState(initialTab);
  const [searchText, setSearchText] = useState("");
  const [advStatus, setAdvStatus] = useState("");
  const [crdStatus, setCrdStatus] = useState("");
  const [invStatus, setInvStatus] = useState("");

  // ── البيانات ──────────────────────────────────────────────────────
  const advQ = useApiQuery<{ data: AdvanceRow[] }>(["vendor-advances"], "/finance/vendor-advances");
  const crdQ = useApiQuery<{ data: CreditRow[] }>(["vendor-credits"], "/finance/vendor-credits");
  const invQ = useApiQuery<{ data: VInvoiceRow[] }>(["vendor-invoices"], "/finance/vendor-invoices");
  const suppliersQ = useApiQuery<{ data: { id: number; name: string }[] }>(
    ["finance-vendors-for-documents"], "/finance/vendors?limit=500",
  );
  const posQ = useApiQuery<{ data: { id: number; ref?: string; poNumber?: string; supplierId?: number }[] }>(
    ["purchase-orders-for-documents"], "/finance/purchase-orders?limit=500",
  );
  const suppliers = suppliersQ.data?.data ?? [];
  const pos = posQ.data?.data ?? [];

  const bySearch = <T extends { ref: string; supplierName: string | null }>(rows: T[]) => {
    if (!searchText) return rows;
    const s = searchText.toLowerCase();
    return rows.filter((r) =>
      r.ref.toLowerCase().includes(s) || (r.supplierName ?? "").toLowerCase().includes(s));
  };
  const advances = useMemo(
    () => bySearch(advQ.data?.data ?? []).filter((r) => !advStatus || r.status === advStatus),
    [advQ.data, searchText, advStatus]);
  const credits = useMemo(
    () => bySearch(crdQ.data?.data ?? []).filter((r) => !crdStatus || r.status === crdStatus),
    [crdQ.data, searchText, crdStatus]);
  const invoices = useMemo(
    () => bySearch(invQ.data?.data ?? []).filter((r) => !invStatus || r.status === invStatus),
    [invQ.data, searchText, invStatus]);

  // ── الإنشاء (نماذج سريعة لكل تبويب) ────────────────────────────────
  const [advOpen, setAdvOpen] = useState(false);
  const [advForm, setAdvForm] = useState({ supplierId: "", amount: "", method: "bank_transfer", reference: "", notes: "" });
  const createAdv = useApiMutation<unknown, {
    supplierId: number; amount: number; method?: string; reference?: string; notes?: string;
  }>("/finance/vendor-advances", "POST", [["vendor-advances"]],
    { successMessage: "سُجلت الدفعة المقدمة وتولّد قيدها" });

  const [crdOpen, setCrdOpen] = useState(false);
  const [crdForm, setCrdForm] = useState({ supplierId: "", amount: "", reason: "", poId: "" });
  const createCrd = useApiMutation<unknown, {
    supplierId: number; amount: number; reason: string; poId?: number;
  }>("/finance/vendor-credits", "POST", [["vendor-credits"]],
    { successMessage: "سُجل الإشعار الدائن وتولّد قيده" });

  const [invOpen, setInvOpen] = useState(false);
  const [invForm, setInvForm] = useState({
    supplierId: "", ref: "", invoiceDate: "", dueDate: "", subtotal: "", vatAmount: "", description: "", poId: "", expenseAccountCode: "",
  });
  // حسابات المصروف القابلة للترحيل لاختيار وجهة الفاتورة (نفس مصدر معالج الاستيراد).
  // المعالج يحترم expenseAccountCode المُدخَل ويتراجع لـ5340 الافتراضي عند تركه فارغاً.
  const expenseAccountsQ = useApiQuery<{ data: { id: number; code: string; name: string }[] }>(
    ["finance-accounts-expense-posting"],
    "/finance/accounts?type=expense&postingOnly=true",
  );
  const expenseAccounts = expenseAccountsQ.data?.data ?? [];
  const createInv = useApiMutation<unknown, {
    supplierId: number; ref: string; invoiceDate: string; dueDate?: string;
    subtotal: number; vatAmount?: number; description?: string; poId?: number; expenseAccountCode?: string;
  }>("/finance/vendor-invoices", "POST", [["vendor-invoices"]],
    { successMessage: "سُجلت فاتورة المورد وتولّد قيدها" });

  // ── التطبيق على أمر شراء (دفعات/إشعارات) ──────────────────────────
  const [applyTarget, setApplyTarget] = useState<{ kind: "advance" | "credit"; row: AdvanceRow | CreditRow } | null>(null);
  const [applyPo, setApplyPo] = useState("");
  const [applyAmount, setApplyAmount] = useState("");
  const applyAdv = useApiMutation<unknown, { id: number; poId: number; amount: number }>(
    (b) => `/finance/vendor-advances/${b.id}/apply`, "POST",
    [["vendor-advances"]], { successMessage: "طُبقت الدفعة المقدمة على أمر الشراء" });
  const applyCrd = useApiMutation<unknown, { id: number; poId: number; amount: number }>(
    (b) => `/finance/vendor-credits/${b.id}/apply`, "POST",
    [["vendor-credits"]], { successMessage: "طُبق الإشعار الدائن على أمر الشراء" });
  const openApply = (kind: "advance" | "credit", row: AdvanceRow | CreditRow) => {
    setApplyTarget({ kind, row });
    const base = kind === "credit" ? Number((row as CreditRow).totalAmount || (row as CreditRow).amount || 0) : Number(row.amount || 0);
    const remaining = base - Number(row.appliedAmount || 0);
    setApplyAmount(remaining > 0 ? String(remaining) : "");
    setApplyPo("");
  };
  const submitApply = () => {
    if (!applyTarget) return;
    const poId = Number(applyPo);
    const amount = Number(applyAmount);
    if (!Number.isFinite(poId) || poId <= 0) { toast({ variant: "destructive", title: "اختر أمر الشراء" }); return; }
    if (!Number.isFinite(amount) || amount <= 0) { toast({ variant: "destructive", title: "أدخل مبلغاً صحيحاً" }); return; }
    const mut = applyTarget.kind === "advance" ? applyAdv : applyCrd;
    mut.mutate({ id: applyTarget.row.id, poId, amount }, { onSuccess: () => setApplyTarget(null) });
  };

  if (advQ.isLoading || crdQ.isLoading || invQ.isLoading) return <LoadingSpinner />;
  if (advQ.isError || crdQ.isError || invQ.isError)
    return <ErrorState onRetry={() => { advQ.refetch(); crdQ.refetch(); invQ.refetch(); }} />;

  // ── المؤشرات ──────────────────────────────────────────────────────
  const advRemaining = advances.reduce((s, r) => s + (Number(r.amount) - Number(r.appliedAmount || 0)), 0);
  const crdRemaining = credits.reduce((s, r) => s + (Number(r.totalAmount || r.amount) - Number(r.appliedAmount || 0)), 0);
  const invOutstanding = invoices.reduce((s, r) => s + (Number(r.total) - Number(r.paidAmount || 0)), 0);

  // ── الأعمدة ───────────────────────────────────────────────────────
  const supplierCell = (name: string | null) =>
    name ?? <span className="italic text-muted-foreground">— محذوف —</span>;

  const advCols: DataTableColumn<AdvanceRow>[] = [
    { key: "ref", header: "المرجع", render: (r) => <span className="font-mono text-xs">{r.ref}</span> },
    { key: "supplierName", header: "المورد", render: (r) => supplierCell(r.supplierName) },
    { key: "paidDate", header: "تاريخ الدفع", render: (r) => <span className="text-xs">{r.paidDate ? formatDateAr(r.paidDate) : "—"}</span> },
    { key: "method", header: "الطريقة", render: (r) => <Badge variant="outline" className="text-xs">{METHOD_LABEL[r.method ?? ""] ?? r.method ?? "—"}</Badge> },
    { key: "amount", header: "المبلغ", render: (r) => <span className="font-mono">{formatCurrency(Number(r.amount))}</span> },
    { key: "appliedAmount", header: "مُطبَّق", render: (r) => <span className="font-mono text-emerald-700">{formatCurrency(Number(r.appliedAmount || 0))}</span> },
    {
      key: "remaining" as keyof AdvanceRow, header: "متبقي",
      render: (r) => <span className="font-mono font-bold text-status-warning-foreground">{formatCurrency(Number(r.amount) - Number(r.appliedAmount || 0))}</span>,
    },
    { key: "status", header: "الحالة", render: (r) => statusBadge(r.status) },
    {
      key: "actions" as keyof AdvanceRow, header: "الإجراءات",
      render: (r) => (
        <div className="flex gap-1">
          {Number(r.amount) - Number(r.appliedAmount || 0) > 0.01 && (
            <GuardedButton perm="finance:create" variant="outline" size="sm"
              onClick={() => openApply("advance", r)}>
              <ArrowDownToLine className="h-3 w-3 me-1" />تطبيق
            </GuardedButton>
          )}
          {journalLink(r.journalId)}
        </div>
      ),
    },
  ];

  const crdCols: DataTableColumn<CreditRow>[] = [
    { key: "ref", header: "المرجع", render: (r) => <span className="font-mono text-xs">{r.ref}</span> },
    { key: "supplierName", header: "المورد", render: (r) => supplierCell(r.supplierName) },
    { key: "memoDate", header: "التاريخ", render: (r) => <span className="text-xs">{r.memoDate ? formatDateAr(r.memoDate) : "—"}</span> },
    { key: "reason", header: "السبب", render: (r) => <span className="text-xs">{r.reason ?? "—"}</span> },
    { key: "totalAmount", header: "الإجمالي", render: (r) => <span className="font-mono">{formatCurrency(Number(r.totalAmount || r.amount))}</span> },
    { key: "appliedAmount", header: "مُطبَّق", render: (r) => <span className="font-mono text-emerald-700">{formatCurrency(Number(r.appliedAmount || 0))}</span> },
    { key: "status", header: "الحالة", render: (r) => statusBadge(r.status) },
    {
      key: "actions" as keyof CreditRow, header: "الإجراءات",
      render: (r) => (
        <div className="flex gap-1">
          {Number(r.totalAmount || r.amount) - Number(r.appliedAmount || 0) > 0.01 && (
            <GuardedButton perm="finance:create" variant="outline" size="sm"
              onClick={() => openApply("credit", r)}>
              <ArrowDownToLine className="h-3 w-3 me-1" />تطبيق
            </GuardedButton>
          )}
          {journalLink(r.journalId)}
        </div>
      ),
    },
  ];

  const invCols: DataTableColumn<VInvoiceRow>[] = [
    { key: "ref", header: "رقم فاتورة المورد", render: (r) => <span className="font-mono text-xs">{r.ref}</span> },
    { key: "supplierName", header: "المورد", render: (r) => supplierCell(r.supplierName) },
    { key: "invoiceDate", header: "تاريخ الفاتورة", render: (r) => <span className="text-xs">{r.invoiceDate ? formatDateAr(r.invoiceDate) : "—"}</span> },
    { key: "dueDate", header: "الاستحقاق", render: (r) => <span className="text-xs">{r.dueDate ? formatDateAr(r.dueDate) : "—"}</span> },
    { key: "subtotal", header: "قبل الضريبة", render: (r) => <span className="font-mono">{formatCurrency(Number(r.subtotal))}</span> },
    { key: "vatAmount", header: "الضريبة", render: (r) => <span className="font-mono">{formatCurrency(Number(r.vatAmount || 0))}</span> },
    { key: "total", header: "الإجمالي", render: (r) => <span className="font-mono font-bold">{formatCurrency(Number(r.total))}</span> },
    {
      key: "outstanding" as keyof VInvoiceRow, header: "المتبقي",
      render: (r) => <span className="font-mono text-status-warning-foreground">{formatCurrency(Number(r.total) - Number(r.paidAmount || 0))}</span>,
    },
    { key: "status", header: "الحالة", render: (r) => statusBadge(r.status) },
    { key: "actions" as keyof VInvoiceRow, header: "", render: (r) => journalLink(r.journalId) },
  ];

  // ── مساعد حقول النماذج السريعة ─────────────────────────────────────
  const field = (label: string, el: React.ReactNode, required = false) => (
    <div>
      <label className="text-[10px] text-muted-foreground">
        {label}{required && <span className="text-status-error-foreground"> *</span>}
      </label>
      {el}
    </div>
  );
  const supplierSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full h-8 px-2 border rounded bg-background text-xs">
      <option value="">— اختر المورد —</option>
      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
  const txt = (v: string, on: (x: string) => void, dir?: "ltr") => (
    <input value={v} onChange={(e) => on(e.target.value)} dir={dir}
      className="w-full h-8 px-2 border rounded text-xs" />
  );
  const dateInput = (v: string, on: (x: string) => void) => (
    <input type="date" value={v} onChange={(e) => on(e.target.value)} dir="ltr"
      className="w-full h-8 px-2 border rounded text-xs" />
  );

  const statusChips = (
    current: string, set: (v: string) => void, options: { value: string; label: string }[],
  ) => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={current === "" ? "default" : "outline"} className="cursor-pointer"
        onClick={() => set("")}>الكل</Badge>
      {options.map((o) => (
        <Badge key={o.value} variant={current === o.value ? "default" : "outline"}
          className="cursor-pointer" onClick={() => set(o.value)}>{o.label}</Badge>
      ))}
    </div>
  );
  const APPLY_STATUSES = [
    { value: "open", label: "مفتوحة" },
    { value: "applied", label: "مطبقة بالكامل" },
  ];
  const INVOICE_STATUSES = [
    { value: "approved", label: "معتمدة" },
    { value: "paid", label: "مدفوعة" },
  ];

  const kpi = (label: string, value: string | number, hint?: string) => (
    <Card>
      <CardContent className="p-3 text-center">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold font-mono">{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );

  return (
    <PageShell
      title="مستندات الموردين"
      subtitle="الدفعات المقدمة وإشعارات الدائن وفواتير الموردين — كل مستند يولّد قيده المحاسبي آلياً ويُطبَّق على أوامر الشراء"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/vendors", label: "الموردون" },
        { label: "مستندات الموردين" },
      ]}
    >
      <FinanceTabsNav />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        {kpi("دفعات مقدمة متبقية", formatCurrency(advRemaining), "قابلة للتطبيق على أوامر شراء")}
        {kpi("إشعارات دائنة متبقية", formatCurrency(crdRemaining), "تخفض مستحقات الموردين")}
        {kpi("فواتير موردين مستحقة", formatCurrency(invOutstanding), `${invoices.length} فاتورة`)}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input value={searchText} onChange={(e) => setSearchText(e.target.value)}
            placeholder="بحث بالمرجع أو اسم المورد..." className="pr-9 h-9" />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="advances" className="gap-1">
            <Wallet className="h-3.5 w-3.5" />دفعات مقدمة ({advances.length})
          </TabsTrigger>
          <TabsTrigger value="credits" className="gap-1">
            <FileMinus className="h-3.5 w-3.5" />إشعارات دائنة ({credits.length})
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1">
            <Receipt className="h-3.5 w-3.5" />فواتير موردين ({invoices.length})
          </TabsTrigger>
        </TabsList>

        {/* ── الدفعات المقدمة ── */}
        <TabsContent value="advances" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {statusChips(advStatus, setAdvStatus, APPLY_STATUSES)}
            <GuardedButton perm="finance:create" variant="outline" size="sm"
              onClick={() => setAdvOpen((v) => !v)}>
              <Plus className="h-4 w-4 me-1" />دفعة مقدمة لمورد
            </GuardedButton>
          </div>
          {advOpen && (
            <Card className="border-dashed">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  القيد المتولد: مدين «دفعات مقدمة لموردين» / دائن «النقدية» — يُرفض في فترة محاسبية مقفلة.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  {field("المورد", supplierSelect(advForm.supplierId, (v) => setAdvForm((f) => ({ ...f, supplierId: v }))), true)}
                  {field("المبلغ (ر.س)", txt(advForm.amount, (v) => setAdvForm((f) => ({ ...f, amount: v })), "ltr"), true)}
                  {field("الطريقة", (
                    <select value={advForm.method} onChange={(e) => setAdvForm((f) => ({ ...f, method: e.target.value }))}
                      className="w-full h-8 px-2 border rounded bg-background text-xs">
                      <option value="bank_transfer">تحويل بنكي</option>
                      <option value="cash">نقدي</option>
                      <option value="check">شيك</option>
                    </select>
                  ))}
                  {field("مرجع (اختياري)", txt(advForm.reference, (v) => setAdvForm((f) => ({ ...f, reference: v }))))}
                </div>
                <GuardedButton perm="finance:create" size="sm" rateLimitAware disabled={createAdv.isPending}
                  onClick={() => {
                    const sid = Number(advForm.supplierId); const amt = Number(advForm.amount);
                    if (!sid) { toast({ variant: "destructive", title: "اختر المورد" }); return; }
                    if (!Number.isFinite(amt) || amt <= 0) { toast({ variant: "destructive", title: "أدخل مبلغاً صحيحاً" }); return; }
                    createAdv.mutate(
                      { supplierId: sid, amount: amt, method: advForm.method, reference: advForm.reference.trim() || undefined, notes: advForm.notes.trim() || undefined },
                      { onSuccess: () => { setAdvForm({ supplierId: "", amount: "", method: "bank_transfer", reference: "", notes: "" }); setAdvOpen(false); } },
                    );
                  }}>
                  {createAdv.isPending ? "جاري التسجيل..." : "تسجيل الدفعة"}
                </GuardedButton>
              </CardContent>
            </Card>
          )}
          <Card><CardContent className="p-0">
            <DataTable columns={advCols} data={advances} pageSize={25}
              emptyMessage="لا توجد دفعات مقدمة لموردين" />
          </CardContent></Card>
        </TabsContent>

        {/* ── الإشعارات الدائنة ── */}
        <TabsContent value="credits" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {statusChips(crdStatus, setCrdStatus, APPLY_STATUSES)}
            <GuardedButton perm="finance:create" variant="outline" size="sm"
              onClick={() => setCrdOpen((v) => !v)}>
              <Plus className="h-4 w-4 me-1" />إشعار دائن من مورد
            </GuardedButton>
          </div>
          {crdOpen && (
            <Card className="border-dashed">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  لمرتجعات المشتريات أو الخصومات اللاحقة — يخفض مستحقات المورد ويُطبَّق على أمر شراء.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  {field("المورد", supplierSelect(crdForm.supplierId, (v) => setCrdForm((f) => ({ ...f, supplierId: v }))), true)}
                  {field("المبلغ (ر.س)", txt(crdForm.amount, (v) => setCrdForm((f) => ({ ...f, amount: v })), "ltr"), true)}
                  {field("السبب", txt(crdForm.reason, (v) => setCrdForm((f) => ({ ...f, reason: v }))), true)}
                  {field("أمر شراء (اختياري)", txt(crdForm.poId, (v) => setCrdForm((f) => ({ ...f, poId: v })), "ltr"))}
                </div>
                <GuardedButton perm="finance:create" size="sm" rateLimitAware disabled={createCrd.isPending}
                  onClick={() => {
                    const sid = Number(crdForm.supplierId); const amt = Number(crdForm.amount);
                    if (!sid) { toast({ variant: "destructive", title: "اختر المورد" }); return; }
                    if (!Number.isFinite(amt) || amt <= 0) { toast({ variant: "destructive", title: "أدخل مبلغاً صحيحاً" }); return; }
                    if (crdForm.reason.trim().length < 3) { toast({ variant: "destructive", title: "سبب الإشعار الدائن مطلوب" }); return; }
                    const poId = Number(crdForm.poId);
                    createCrd.mutate(
                      { supplierId: sid, amount: amt, reason: crdForm.reason.trim(), poId: Number.isFinite(poId) && poId > 0 ? poId : undefined },
                      { onSuccess: () => { setCrdForm({ supplierId: "", amount: "", reason: "", poId: "" }); setCrdOpen(false); } },
                    );
                  }}>
                  {createCrd.isPending ? "جاري التسجيل..." : "تسجيل الإشعار"}
                </GuardedButton>
              </CardContent>
            </Card>
          )}
          <Card><CardContent className="p-0">
            <DataTable columns={crdCols} data={credits} pageSize={25}
              emptyMessage="لا توجد إشعارات دائنة" />
          </CardContent></Card>
        </TabsContent>

        {/* ── فواتير الموردين ── */}
        <TabsContent value="invoices" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {statusChips(invStatus, setInvStatus, INVOICE_STATUSES)}
            <GuardedButton perm="finance:create" variant="outline" size="sm"
              onClick={() => setInvOpen((v) => !v)}>
              <Plus className="h-4 w-4 me-1" />فاتورة مورد
            </GuardedButton>
          </div>
          {invOpen && (
            <Card className="border-dashed">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  فاتورة مورد مباشرة (بدون استلام مخزني) — القيد: مدين «المصروف + الضريبة» / دائن «الذمم الدائنة».
                </p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  {field("المورد", supplierSelect(invForm.supplierId, (v) => setInvForm((f) => ({ ...f, supplierId: v }))), true)}
                  {field("رقم فاتورة المورد", txt(invForm.ref, (v) => setInvForm((f) => ({ ...f, ref: v })), "ltr"), true)}
                  {field("تاريخ الفاتورة", dateInput(invForm.invoiceDate, (v) => setInvForm((f) => ({ ...f, invoiceDate: v }))), true)}
                  {field("تاريخ الاستحقاق", dateInput(invForm.dueDate, (v) => setInvForm((f) => ({ ...f, dueDate: v }))))}
                  {field("المبلغ قبل الضريبة", txt(invForm.subtotal, (v) => setInvForm((f) => ({ ...f, subtotal: v })), "ltr"), true)}
                  {field("الضريبة", txt(invForm.vatAmount, (v) => setInvForm((f) => ({ ...f, vatAmount: v })), "ltr"))}
                  {field("الوصف", txt(invForm.description, (v) => setInvForm((f) => ({ ...f, description: v }))))}
                  {field("حساب المصروف (اختياري — الافتراضي عام)", (
                    <select value={invForm.expenseAccountCode}
                      onChange={(e) => setInvForm((f) => ({ ...f, expenseAccountCode: e.target.value }))}
                      className="w-full h-8 px-2 border rounded bg-background text-xs">
                      <option value="">— افتراضي (مصروف عام) —</option>
                      {expenseAccounts.map((a) => (
                        <option key={a.id} value={a.code}>{a.code} — {a.name}</option>
                      ))}
                    </select>
                  ))}
                  {field("أمر شراء (اختياري)", txt(invForm.poId, (v) => setInvForm((f) => ({ ...f, poId: v })), "ltr"))}
                </div>
                <GuardedButton perm="finance:create" size="sm" rateLimitAware disabled={createInv.isPending}
                  onClick={() => {
                    const sid = Number(invForm.supplierId); const sub = Number(invForm.subtotal);
                    if (!sid) { toast({ variant: "destructive", title: "اختر المورد" }); return; }
                    if (!invForm.ref.trim()) { toast({ variant: "destructive", title: "رقم فاتورة المورد مطلوب" }); return; }
                    if (!invForm.invoiceDate) { toast({ variant: "destructive", title: "تاريخ الفاتورة مطلوب" }); return; }
                    if (!Number.isFinite(sub) || sub < 0) { toast({ variant: "destructive", title: "أدخل المبلغ قبل الضريبة" }); return; }
                    const vat = Number(invForm.vatAmount); const poId = Number(invForm.poId);
                    createInv.mutate(
                      {
                        supplierId: sid, ref: invForm.ref.trim(), invoiceDate: invForm.invoiceDate,
                        dueDate: invForm.dueDate || undefined, subtotal: sub,
                        vatAmount: Number.isFinite(vat) && vat > 0 ? vat : undefined,
                        description: invForm.description.trim() || undefined,
                        poId: Number.isFinite(poId) && poId > 0 ? poId : undefined,
                        expenseAccountCode: invForm.expenseAccountCode || undefined,
                      },
                      { onSuccess: () => { setInvForm({ supplierId: "", ref: "", invoiceDate: "", dueDate: "", subtotal: "", vatAmount: "", description: "", poId: "", expenseAccountCode: "" }); setInvOpen(false); } },
                    );
                  }}>
                  {createInv.isPending ? "جاري التسجيل..." : "تسجيل الفاتورة"}
                </GuardedButton>
              </CardContent>
            </Card>
          )}
          <Card><CardContent className="p-0">
            <DataTable columns={invCols} data={invoices} pageSize={25}
              emptyMessage="لا توجد فواتير موردين" />
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* حوار التطبيق على أمر شراء */}
      <AlertDialog open={!!applyTarget} onOpenChange={(o) => { if (!o) setApplyTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {applyTarget?.kind === "advance" ? "تطبيق الدفعة المقدمة على أمر شراء" : "تطبيق الإشعار الدائن على أمر شراء"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {applyTarget && (
                <>المرجع {applyTarget.row.ref} — مورد {applyTarget.row.supplierName ?? "—"}. الخادم يرفض تجاوز المتبقي ويرفض الفترات المقفلة.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="vd-apply-po">أمر الشراء <span className="text-status-error-foreground">*</span></Label>
              <select id="vd-apply-po" value={applyPo} onChange={(e) => setApplyPo(e.target.value)}
                className="w-full h-9 px-2 border rounded bg-background text-sm">
                <option value="">— اختر أمر الشراء —</option>
                {pos
                  .filter((p) => !applyTarget || !p.supplierId || p.supplierId === applyTarget.row.supplierId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {(p.poNumber || p.ref || `#${p.id}`) as string}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="vd-apply-amount">المبلغ (ر.س) <span className="text-status-error-foreground">*</span></Label>
              <Input id="vd-apply-amount" value={applyAmount} dir="ltr"
                onChange={(e) => setApplyAmount(e.target.value)} />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <GuardedButton perm="finance:create"
              onClick={(e: React.MouseEvent) => { e.preventDefault(); submitApply(); }}
              disabled={applyAdv.isPending || applyCrd.isPending}>
              {applyAdv.isPending || applyCrd.isPending ? "جاري التطبيق..." : "تأكيد التطبيق"}
            </GuardedButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
