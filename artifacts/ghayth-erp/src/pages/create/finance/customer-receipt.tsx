import { useMemo, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { CreatePageLayout } from "@workspace/ui-core";
import { ActiveContextNotice, useActiveFinanceContext } from "@/components/shared/active-context-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { GuardedButton } from "@/components/shared/permission-gate";
import { ClientSelect } from "@/components/shared/entity-selects";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { FinanceOperationContextPanel } from "@/components/shared/finance-operation-context-panel";
import { EMPTY_ALLOCATION_TARGET, type AllocationTargetValue } from "@/components/shared/allocation-target-select";
import { buildAllocationPayload } from "@/components/shared/line-allocation-panel";
import {
  ReceiptText, CheckCircle2, AlertCircle, Wand2, ListChecks,
} from "lucide-react";

/**
 * Customer Receipt + Auto-Apply Wizard
 *
 * Daily AR clerk workflow when a customer pays:
 *  1. Pick customer
 *  2. Enter amount + payment method (cash/bank/transfer)
 *  3. System auto-fetches that customer's open invoices (oldest first)
 *  4. Clerk checks which to apply OR uses "auto-apply oldest first"
 *  5. Submit sends the receipt SEMANTICS to POST /finance/customer-receipts;
 *     the backend resolves the GL accounts through the accounting engine,
 *     advances each invoice's paidAmount/status, records any leftover as a
 *     customer advance, and posts ONE balanced JE (#1945 FIN-03).
 */

interface OpenInvoice {
  id: number;
  ref: string;
  status: string;
  total: number | string;
  paidAmount: number | string;
  dueDate?: string | null;
  createdAt: string;
}

interface ApplyRow {
  invoiceId: number;
  ref: string;
  outstanding: number;
  daysOld: number;
  applyAmount: number;
  selected: boolean;
}

function daysSinceIso(iso: string): number {
  // utc-ok: simple "days since posting" calc
  const d = new Date(iso);
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

export default function CustomerReceiptWizardPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [header, setHeader] = useState({
    clientId: "",
    date: todayLocal(),
    paymentMethod: "bank" as "cash" | "bank" | "check" | "transfer",
    amount: "" as number | string,
    reference: "",
    notes: "",
  });
  // #1945 FIN-03 — stable idempotency key for this wizard session: a network
  // retry of the same submit must not double-apply the invoice payments.
  const [receiptKey] = useState(() => crypto.randomUUID());

  const [applyMode, setApplyMode] = useState<"manual" | "fifo">("fifo");
  const [rows, setRows] = useState<ApplyRow[]>([]);
  // #1715 §6 — optional operation context: tag the receipt to a project /
  // cost-center / other dimension (stamped on the cash line so the inflow
  // shows up in that dimension's reports).
  const [allocTarget, setAllocTarget] = useState<AllocationTargetValue>(EMPTY_ALLOCATION_TARGET);

  // Pick customer → fetch open invoices for that customer
  const enabled = !!header.clientId;
  const { data: invoicesResp, isLoading } = useApiQuery<{ data: OpenInvoice[] }>(
    ["customer-open-invoices", header.clientId],
    enabled ? `/finance/invoices?clientId=${header.clientId}&status=sent,partial,overdue&limit=200` : null,
    enabled,
  );

  const openInvoices: OpenInvoice[] = useMemo(() => {
    const all = invoicesResp?.data ?? [];
    return all
      .map((inv) => ({
        ...inv,
        outstanding: Number(inv.total ?? 0) - Number(inv.paidAmount ?? 0),
      }))
      .filter((inv) => inv.outstanding > 0)
      .sort((a, b) => {
        // Oldest first (FIFO)
        const d1 = a.dueDate ?? a.createdAt;
        const d2 = b.dueDate ?? b.createdAt;
        return d1 < d2 ? -1 : 1;
      });
  }, [invoicesResp]);

  // Rebuild apply rows when invoices change
  useEffect(() => {
    const next: ApplyRow[] = openInvoices.map((inv) => ({
      invoiceId: inv.id,
      ref: inv.ref,
      outstanding: Number(inv.total ?? 0) - Number(inv.paidAmount ?? 0),
      daysOld: daysSinceIso(inv.dueDate ?? inv.createdAt),
      applyAmount: 0,
      selected: false,
    }));
    setRows(next);
  }, [openInvoices]);

  const totalAmount = Number(header.amount) || 0;
  const totalApplied = rows.reduce((s, r) => s + (r.selected ? r.applyAmount : 0), 0);
  const leftover = totalAmount - totalApplied;
  // #1945 FIN-03 — a POSITIVE leftover is legitimate (recorded server-side as
  // a customer advance, the FIN-08 flow). Only over-application blocks. The
  // old gate demanded leftover==0, which made the advance path unreachable
  // despite the page promising it.
  const balanced = leftover >= -0.005;

  // Auto-apply FIFO
  const runFifo = () => {
    if (totalAmount <= 0) {
      toast({ variant: "destructive", title: "أدخل المبلغ أولاً" });
      return;
    }
    let remaining = totalAmount;
    const next: ApplyRow[] = rows.map((r) => {
      if (remaining <= 0) return { ...r, selected: false, applyAmount: 0 };
      const apply = Math.min(r.outstanding, remaining);
      remaining -= apply;
      return { ...r, selected: apply > 0, applyAmount: Number(apply.toFixed(2)) };
    });
    setRows(next);
  };

  const toggleRow = (id: number) => {
    setRows((prev) => prev.map((r) => {
      if (r.invoiceId !== id) return r;
      // Toggle: if turning on, default to outstanding amount; if off, zero
      if (!r.selected) return { ...r, selected: true, applyAmount: Math.min(r.outstanding, totalAmount - totalApplied + r.applyAmount) };
      return { ...r, selected: false, applyAmount: 0 };
    }));
  };

  const setRowAmount = (id: number, amt: number) => {
    setRows((prev) => prev.map((r) => r.invoiceId === id ? { ...r, applyAmount: amt, selected: amt > 0 } : r));
  };

  // ── Semantic JE preview (#1945 FIN-03) — what the receipt MEANS, not GL
  // codes. The actual accounts are resolved by the accounting engine at save
  // (resolveAccountCode); hardcoded codes here used to point at a
  // non-postable header (1200), the furniture account (1220) and the vendors
  // header (2110) on a SOCPA tree.
  const previewLegs = () => {
    const legs: Array<{ label: string; description: string; debit: number; credit: number }> = [];
    legs.push({
      label: "النقدية / البنك",
      description: `حسب طريقة الاستلام — ${header.reference || todayLocal()}`,
      debit: totalAmount,
      credit: 0,
    });
    for (const r of rows) {
      if (!r.selected || r.applyAmount <= 0) continue;
      legs.push({ label: "ذمم العملاء", description: `تسوية فاتورة ${r.ref}`, debit: 0, credit: r.applyAmount });
    }
    if (leftover > 0.005) {
      legs.push({ label: "التزام دفعة مقدمة", description: "متبقي بدون تطبيق فوراً", debit: 0, credit: Number(leftover.toFixed(2)) });
    }
    return legs;
  };

  const receiptMut = useApiMutation("/finance/customer-receipts", "POST", [["journal"], ["customer-open-invoices"], ["invoices"]]);

  const validate = (): string | null => {
    if (!header.clientId) return "اختر العميل";
    if (totalAmount <= 0) return "أدخل المبلغ المستلم";
    if (!balanced) return `التطبيق يتجاوز المستلم بـ ${formatCurrency(-leftover)} — قلّل مبالغ التطبيق`;
    if (totalApplied === 0 && leftover === 0) return "اختر فواتير للتطبيق أو ضع المبلغ";
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { toast({ variant: "destructive", title: err }); return; }
    try {
      // Receipt SEMANTICS only — the backend resolves the GL accounts
      // through the accounting engine and updates the invoices atomically.
      await receiptMut.mutateAsync({
        clientId: Number(header.clientId),
        amount: totalAmount,
        method: header.paymentMethod,
        receiptKey,
        date: header.date,
        reference: header.reference || undefined,
        notes: header.notes || undefined,
        applications: rows
          .filter((r) => r.selected && r.applyAmount > 0)
          .map((r) => ({ invoiceId: r.invoiceId, amount: r.applyAmount })),
        lineAllocation: allocTarget.target !== "none" ? buildAllocationPayload(allocTarget.allocation) : undefined,
      });
      toast({
        title: "تم تسجيل الاستلام",
        description: `${formatCurrency(totalAmount)} — ${rows.filter((r) => r.selected).length} فاتورة طُبِّق عليها`,
      });
      setLocation("/finance/receivables");
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر التسجيل", description: getErrorMessage(e) });
    }
  };

  const activeCtx = useActiveFinanceContext();

  return (
    <CreatePageLayout title="معالج استلام دفعة من عميل" backPath="/finance/receivables">
      <ActiveContextNotice ctx={activeCtx} />
      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <ReceiptText className="h-4 w-4" /> دفعة عميل في 3 خطوات
          </p>
          <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-0.5">
            <li>اختر العميل وأدخل المبلغ المستلم</li>
            <li>اختر "FIFO" لتطبيق أقدم فاتورة أولاً، أو حدّد يدوياً</li>
            <li>الـ wizard يبني JE متوازن: <strong>مدين النقد/البنك</strong> + <strong>دائن ذمم العميل</strong> لكل فاتورة + (إن وُجد متبقي) <strong>دائن دفعة مقدّمة</strong></li>
          </ol>
        </CardContent>
      </Card>

      {/* ── Header ────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">بيانات الدفعة</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <ClientSelect value={header.clientId} onChange={(v) => setHeader({ ...header, clientId: String(v ?? "") })} label="العميل *" />
          </div>
          <div>
            <Label className="text-xs">التاريخ</Label>
            <Input type="date" value={header.date} onChange={(e) => setHeader({ ...header, date: e.target.value })} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">طريقة الاستلام</Label>
            <Select value={header.paymentMethod} onValueChange={(v) => {
              // #1945 FIN-03 — the cash/bank ACCOUNT is resolved by the
              // accounting engine at save; the method is pure semantics here.
              setHeader({ ...header, paymentMethod: v as any });
            }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">نقد</SelectItem>
                <SelectItem value="bank">إيداع بنكي</SelectItem>
                <SelectItem value="transfer">تحويل بنكي</SelectItem>
                <SelectItem value="check">شيك</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">المبلغ المستلم *</Label>
            <Input type="number" step="0.01" value={header.amount}
              onChange={(e) => setHeader({ ...header, amount: e.target.value })}
              placeholder="0.00" className="h-9 font-mono text-lg" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">مرجع (شيك / SWIFT / SADAD)</Label>
            <Input value={header.reference} onChange={(e) => setHeader({ ...header, reference: e.target.value })}
              placeholder="اختياري" className="h-9" />
          </div>
          <div>
            <Label className="text-xs">ملاحظات</Label>
            <Input value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} className="h-9" />
          </div>
        </CardContent>
      </Card>

      {/* ── Operation context (optional) ─────────────────────── */}
      <FinanceOperationContextPanel
        value={allocTarget}
        onChange={setAllocTarget}
        title="ربط الاستلام بـ (اختياري)"
        description="اربط هذا الاستلام بمشروع / مركز تكلفة / بُعد آخر ليظهر في تقاريره. العميل والفواتير مرتبطة تلقائياً."
      />

      {/* ── Application ──────────────────────────────────────── */}
      {header.clientId && (
        <Card className="mb-4">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <ListChecks className="h-4 w-4" /> تطبيق على الفواتير المفتوحة ({rows.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={applyMode} onValueChange={(v) => setApplyMode(v as any)}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fifo">FIFO (الأقدم أولاً)</SelectItem>
                  <SelectItem value="manual">يدوي</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={runFifo} disabled={totalAmount <= 0 || rows.length === 0}>
                <Wand2 className="h-3 w-3 me-1" /> طبّق تلقائياً
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            {isLoading ? (
              <p className="text-xs text-muted-foreground text-center py-4">جاري تحميل الفواتير...</p>
            ) : rows.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                لا توجد فواتير مفتوحة لهذا العميل — كل المبلغ سيُسجَّل كدفعة مقدّمة
              </p>
            ) : (
              <div className="space-y-1">
                <div className="grid grid-cols-12 gap-2 text-[10px] text-muted-foreground border-b pb-1 font-semibold">
                  <div className="col-span-1"></div>
                  <div className="col-span-3">المرجع</div>
                  <div className="col-span-2">العمر</div>
                  <div className="col-span-3 text-end">المتبقي</div>
                  <div className="col-span-3 text-end">المبلغ المطبَّق</div>
                </div>
                {rows.map((r) => {
                  const ageColor = r.daysOld >= 60 ? "text-red-700 font-bold"
                    : r.daysOld >= 30 ? "text-amber-700"
                    : "text-muted-foreground";
                  return (
                    <div key={r.invoiceId} className={`grid grid-cols-12 gap-2 items-center p-2 rounded text-xs border ${r.selected ? "border-emerald-300 bg-emerald-50/30" : "border-muted"}`}>
                      <div className="col-span-1">
                        <input type="checkbox" checked={r.selected}
                          onChange={() => toggleRow(r.invoiceId)}
                          className="h-4 w-4" />
                      </div>
                      <div className="col-span-3">
                        <span className="font-mono text-xs">{r.ref}</span>
                      </div>
                      <div className={`col-span-2 font-mono text-xs ${ageColor}`}>
                        {r.daysOld} يوم
                      </div>
                      <div className="col-span-3 text-end font-mono font-semibold">
                        {formatCurrency(r.outstanding)}
                      </div>
                      <div className="col-span-3 text-end">
                        <Input
                          type="number" step="0.01"
                          value={r.applyAmount || ""}
                          onChange={(e) => setRowAmount(r.invoiceId, Number(e.target.value) || 0)}
                          className="h-7 text-xs font-mono text-end"
                          placeholder="0"
                          disabled={applyMode === "fifo"}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Balance Indicator ─────────────────────────────────── */}
      {totalAmount > 0 && (
        <Card className={`mb-4 ${balanced ? "border-emerald-400 bg-emerald-50/30" : leftover > 0 ? "border-amber-400 bg-amber-50/30" : "border-red-400 bg-red-50/30"}`}>
          <CardContent className="p-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">المستلم</p>
                <p className="text-base font-bold font-mono">{formatCurrency(totalAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">المطبَّق على فواتير</p>
                <p className="text-base font-bold font-mono">{formatCurrency(totalApplied)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">المتبقي</p>
                <p className={`text-base font-bold font-mono ${
                  Math.abs(leftover) < 0.01 ? "text-emerald-700"
                  : leftover > 0 ? "text-amber-700"
                  : "text-red-700"
                }`}>
                  {formatCurrency(leftover)}
                </p>
                {leftover > 0.01 && (
                  <p className="text-[10px] text-amber-800 mt-1">سيُسجَّل كدفعة مقدّمة</p>
                )}
                {leftover < -0.01 && (
                  <p className="text-[10px] text-red-700 mt-1">تطبيق أكثر من المستلم — أصلح</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── JE Preview ────────────────────────────────────────── */}
      {totalAmount > 0 && Math.abs(totalAmount - totalApplied - Math.max(0, leftover)) < 0.01 && (
        <Card className="mb-4 bg-muted/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3" /> معاينة القيد
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-end p-1">البند</th>
                  <th className="text-end p-1">الوصف</th>
                  <th className="text-end p-1">مدين</th>
                  <th className="text-end p-1">دائن</th>
                </tr>
              </thead>
              <tbody>
                {previewLegs().map((jl, i) => (
                  <tr key={i} className="border-b border-dashed">
                    <td className="p-1">{jl.label}</td>
                    <td className="p-1 text-muted-foreground">{jl.description}</td>
                    <td className="p-1 font-mono text-end text-emerald-700">
                      {Number(jl.debit) > 0 ? formatCurrency(Number(jl.debit)) : "—"}
                    </td>
                    <td className="p-1 font-mono text-end text-red-700">
                      {Number(jl.credit) > 0 ? formatCurrency(Number(jl.credit)) : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/40 font-bold">
                  <td colSpan={2} className="p-1 text-end">الإجمالي</td>
                  <td className="p-1 font-mono text-end text-emerald-700">{formatCurrency(totalAmount)}</td>
                  <td className="p-1 font-mono text-end text-red-700">{formatCurrency(totalAmount)}</td>
                </tr>
              </tbody>
            </table>
            {/* #1945 (FIN-03) — الحسابات الفعلية يحدّدها محرك الترحيل
                (resolveAccountCode) عند الحفظ؛ لا نعرض أكوادًا ثابتة قد تخالف
                ما يُرحَّل فعليًا (كانت 1200/1220/2110 وهي رأس غير قابل للترحيل /
                حساب الأثاث / رأس الموردين على شجرة SOCPA). */}
            <p className="text-[10px] text-muted-foreground mt-2">
              الحسابات الفعلية يحدّدها محرك الترحيل عند الحفظ حسب إعداد الشركة.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => setLocation("/finance/receivables")}>إلغاء</Button>
        <GuardedButton
          perm="finance:create"
          onClick={handleSubmit}
          disabled={receiptMut.isPending || !header.clientId || totalAmount <= 0 || !balanced || !activeCtx.ready}
          rateLimitAware
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {receiptMut.isPending
            ? "جاري التسجيل..."
            : <><CheckCircle2 className="h-4 w-4 me-1" /> تسجيل الاستلام</>}
        </GuardedButton>
      </div>

      {!balanced && totalAmount > 0 && leftover < -0.005 && (
        <Card className="mt-3 border-red-300 bg-red-50/30">
          <CardContent className="p-3 text-xs text-red-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            تطبيق أكثر من المبلغ المستلم — قلّل قيم التطبيق
          </CardContent>
        </Card>
      )}
    </CreatePageLayout>
  );
}
import { useMemo, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { CreatePageLayout } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { GuardedButton } from "@/components/shared/permission-gate";
import { ClientSelect, AccountSelect } from "@/components/shared/entity-selects";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import {
  ReceiptText, CheckCircle2, AlertCircle, Wand2, ListChecks,
} from "lucide-react";

/**
 * Customer Receipt + Auto-Apply Wizard
 *
 * Daily AR clerk workflow when a customer pays:
 *  1. Pick customer
 *  2. Enter amount + payment method (cash/bank/transfer)
 *  3. System auto-fetches that customer's open invoices (oldest first)
 *  4. Clerk checks which to apply OR uses "auto-apply oldest first"
 *  5. Wizard builds balanced JE:
 *       DR cash/bank (debit side = total received)
 *       CR AR per invoice (multiple credit lines)
 *     + writes customer_advances row if there's leftover
 *
 * Currently this requires manually building a voucher + N allocations.
 */

interface OpenInvoice {
  id: number;
  ref: string;
  status: string;
  total: number | string;
  paidAmount: number | string;
  dueDate?: string | null;
  createdAt: string;
}

interface ApplyRow {
  invoiceId: number;
  ref: string;
  outstanding: number;
  daysOld: number;
  applyAmount: number;
  selected: boolean;
}

function daysSinceIso(iso: string): number {
  // utc-ok: simple "days since posting" calc
  const d = new Date(iso);
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

export default function CustomerReceiptWizardPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [header, setHeader] = useState({
    clientId: "",
    date: todayLocal(),
    paymentMethod: "bank" as "cash" | "bank" | "check" | "transfer",
    receiptAccountCode: "1200",
    amount: "" as number | string,
    reference: "",
    notes: "",
  });

  const [applyMode, setApplyMode] = useState<"manual" | "fifo">("fifo");
  const [rows, setRows] = useState<ApplyRow[]>([]);

  // Pick customer → fetch open invoices for that customer
  const enabled = !!header.clientId;
  const { data: invoicesResp, isLoading } = useApiQuery<{ data: OpenInvoice[] }>(
    ["customer-open-invoices", header.clientId],
    enabled ? `/finance/invoices?clientId=${header.clientId}&status=sent,partial,overdue&limit=200` : null,
    enabled,
  );

  const openInvoices: OpenInvoice[] = useMemo(() => {
    const all = invoicesResp?.data ?? [];
    return all
      .map((inv) => ({
        ...inv,
        outstanding: Number(inv.total ?? 0) - Number(inv.paidAmount ?? 0),
      }))
      .filter((inv) => inv.outstanding > 0)
      .sort((a, b) => {
        // Oldest first (FIFO)
        const d1 = a.dueDate ?? a.createdAt;
        const d2 = b.dueDate ?? b.createdAt;
        return d1 < d2 ? -1 : 1;
      });
  }, [invoicesResp]);

  // Rebuild apply rows when invoices change
  useEffect(() => {
    const next: ApplyRow[] = openInvoices.map((inv) => ({
      invoiceId: inv.id,
      ref: inv.ref,
      outstanding: Number(inv.total ?? 0) - Number(inv.paidAmount ?? 0),
      daysOld: daysSinceIso(inv.dueDate ?? inv.createdAt),
      applyAmount: 0,
      selected: false,
    }));
    setRows(next);
  }, [openInvoices]);

  const totalAmount = Number(header.amount) || 0;
  const totalApplied = rows.reduce((s, r) => s + (r.selected ? r.applyAmount : 0), 0);
  const leftover = totalAmount - totalApplied;
  const balanced = Math.abs(leftover) <= 0.005;

  // Auto-apply FIFO
  const runFifo = () => {
    if (totalAmount <= 0) {
      toast({ variant: "destructive", title: "أدخل المبلغ أولاً" });
      return;
    }
    let remaining = totalAmount;
    const next: ApplyRow[] = rows.map((r) => {
      if (remaining <= 0) return { ...r, selected: false, applyAmount: 0 };
      const apply = Math.min(r.outstanding, remaining);
      remaining -= apply;
      return { ...r, selected: apply > 0, applyAmount: Number(apply.toFixed(2)) };
    });
    setRows(next);
  };

  const toggleRow = (id: number) => {
    setRows((prev) => prev.map((r) => {
      if (r.invoiceId !== id) return r;
      // Toggle: if turning on, default to outstanding amount; if off, zero
      if (!r.selected) return { ...r, selected: true, applyAmount: Math.min(r.outstanding, totalAmount - totalApplied + r.applyAmount) };
      return { ...r, selected: false, applyAmount: 0 };
    }));
  };

  const setRowAmount = (id: number, amt: number) => {
    setRows((prev) => prev.map((r) => r.invoiceId === id ? { ...r, applyAmount: amt, selected: amt > 0 } : r));
  };

  // ── Build JE
  const buildJournalLines = () => {
    const lines: any[] = [];
    lines.push({
      accountCode: header.receiptAccountCode,
      debit: totalAmount,
      credit: 0,
      description: `استلام من العميل ${header.clientId} — ${header.reference || todayLocal()}`,
      clientId: Number(header.clientId),
    });

    // CR AR per applied invoice
    const arAccountCode = "1220"; // ذمم العملاء default
    for (const r of rows) {
      if (!r.selected || r.applyAmount <= 0) continue;
      lines.push({
        accountCode: arAccountCode,
        debit: 0,
        credit: r.applyAmount,
        description: `تسوية فاتورة ${r.ref}`,
        clientId: Number(header.clientId),
      });
    }

    // Leftover → customer advance liability
    if (leftover > 0.005) {
      lines.push({
        accountCode: "2110", // customer advances liability
        debit: 0,
        credit: Number(leftover.toFixed(2)),
        description: `دفعة مقدّمة بدون تطبيق فوراً`,
        clientId: Number(header.clientId),
      });
    }

    return lines;
  };

  const journalMut = useApiMutation("/finance/journal", "POST", [["journal"]]);

  const validate = (): string | null => {
    if (!header.clientId) return "اختر العميل";
    if (totalAmount <= 0) return "أدخل المبلغ المستلم";
    if (!balanced) return `الفرق ${formatCurrency(leftover)} — اضبط المبالغ أو فعّل FIFO`;
    if (totalApplied === 0 && leftover === 0) return "اختر فواتير للتطبيق أو ضع المبلغ";
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { toast({ variant: "destructive", title: err }); return; }
    try {
      await journalMut.mutateAsync({
        ref: header.reference || `REC-${header.date}-${Date.now().toString(36).slice(-4)}`,
        date: header.date,
        description: header.notes || `استلام من عميل — ${header.amount} ر.س`,
        lines: buildJournalLines(),
      });
      toast({
        title: "تم تسجيل الاستلام",
        description: `${formatCurrency(totalAmount)} — ${rows.filter((r) => r.selected).length} فاتورة طُبِّق عليها`,
      });
      setLocation("/finance/receivables");
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر التسجيل", description: getErrorMessage(e) });
    }
  };

  return (
    <CreatePageLayout title="معالج استلام دفعة من عميل" backPath="/finance/receivables">
      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <ReceiptText className="h-4 w-4" /> دفعة عميل في 3 خطوات
          </p>
          <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-0.5">
            <li>اختر العميل وأدخل المبلغ المستلم</li>
            <li>اختر "FIFO" لتطبيق أقدم فاتورة أولاً، أو حدّد يدوياً</li>
            <li>الـ wizard يبني JE متوازن: <strong>مدين النقد/البنك</strong> + <strong>دائن ذمم العميل</strong> لكل فاتورة + (إن وُجد متبقي) <strong>دائن دفعة مقدّمة</strong></li>
          </ol>
        </CardContent>
      </Card>

      {/* ── Header ────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">بيانات الدفعة</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <ClientSelect value={header.clientId} onChange={(v) => setHeader({ ...header, clientId: String(v ?? "") })} label="العميل *" />
          </div>
          <div>
            <Label className="text-xs">التاريخ</Label>
            <Input type="date" value={header.date} onChange={(e) => setHeader({ ...header, date: e.target.value })} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">طريقة الاستلام</Label>
            <Select value={header.paymentMethod} onValueChange={(v) => {
              const code = v === "cash" ? "1100" : v === "bank" || v === "transfer" ? "1200" : "1200";
              setHeader({ ...header, paymentMethod: v as any, receiptAccountCode: code });
            }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">نقد</SelectItem>
                <SelectItem value="bank">إيداع بنكي</SelectItem>
                <SelectItem value="transfer">تحويل بنكي</SelectItem>
                <SelectItem value="check">شيك</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <AccountSelect
              value={header.receiptAccountCode}
              onChange={(v) => setHeader({ ...header, receiptAccountCode: String(v ?? "") })}
              label="حساب الاستلام *"
            />
          </div>
          <div>
            <Label className="text-xs">المبلغ المستلم *</Label>
            <Input type="number" step="0.01" value={header.amount}
              onChange={(e) => setHeader({ ...header, amount: e.target.value })}
              placeholder="0.00" className="h-9 font-mono text-lg" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">مرجع (شيك / SWIFT / SADAD)</Label>
            <Input value={header.reference} onChange={(e) => setHeader({ ...header, reference: e.target.value })}
              placeholder="اختياري" className="h-9" />
          </div>
          <div>
            <Label className="text-xs">ملاحظات</Label>
            <Input value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} className="h-9" />
          </div>
        </CardContent>
      </Card>

      {/* ── Application ──────────────────────────────────────── */}
      {header.clientId && (
        <Card className="mb-4">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <ListChecks className="h-4 w-4" /> تطبيق على الفواتير المفتوحة ({rows.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={applyMode} onValueChange={(v) => setApplyMode(v as any)}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fifo">FIFO (الأقدم أولاً)</SelectItem>
                  <SelectItem value="manual">يدوي</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={runFifo} disabled={totalAmount <= 0 || rows.length === 0}>
                <Wand2 className="h-3 w-3 me-1" /> طبّق تلقائياً
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            {isLoading ? (
              <p className="text-xs text-muted-foreground text-center py-4">جاري تحميل الفواتير...</p>
            ) : rows.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                لا توجد فواتير مفتوحة لهذا العميل — كل المبلغ سيُسجَّل كدفعة مقدّمة
              </p>
            ) : (
              <div className="space-y-1">
                <div className="grid grid-cols-12 gap-2 text-[10px] text-muted-foreground border-b pb-1 font-semibold">
                  <div className="col-span-1"></div>
                  <div className="col-span-3">المرجع</div>
                  <div className="col-span-2">العمر</div>
                  <div className="col-span-3 text-end">المتبقي</div>
                  <div className="col-span-3 text-end">المبلغ المطبَّق</div>
                </div>
                {rows.map((r) => {
                  const ageColor = r.daysOld >= 60 ? "text-red-700 font-bold"
                    : r.daysOld >= 30 ? "text-amber-700"
                    : "text-muted-foreground";
                  return (
                    <div key={r.invoiceId} className={`grid grid-cols-12 gap-2 items-center p-2 rounded text-xs border ${r.selected ? "border-emerald-300 bg-emerald-50/30" : "border-muted"}`}>
                      <div className="col-span-1">
                        <input type="checkbox" checked={r.selected}
                          onChange={() => toggleRow(r.invoiceId)}
                          className="h-4 w-4" />
                      </div>
                      <div className="col-span-3">
                        <span className="font-mono text-xs">{r.ref}</span>
                      </div>
                      <div className={`col-span-2 font-mono text-xs ${ageColor}`}>
                        {r.daysOld} يوم
                      </div>
                      <div className="col-span-3 text-end font-mono font-semibold">
                        {formatCurrency(r.outstanding)}
                      </div>
                      <div className="col-span-3 text-end">
                        <Input
                          type="number" step="0.01"
                          value={r.applyAmount || ""}
                          onChange={(e) => setRowAmount(r.invoiceId, Number(e.target.value) || 0)}
                          className="h-7 text-xs font-mono text-end"
                          placeholder="0"
                          disabled={applyMode === "fifo"}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Balance Indicator ─────────────────────────────────── */}
      {totalAmount > 0 && (
        <Card className={`mb-4 ${balanced ? "border-emerald-400 bg-emerald-50/30" : leftover > 0 ? "border-amber-400 bg-amber-50/30" : "border-red-400 bg-red-50/30"}`}>
          <CardContent className="p-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">المستلم</p>
                <p className="text-base font-bold font-mono">{formatCurrency(totalAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">المطبَّق على فواتير</p>
                <p className="text-base font-bold font-mono">{formatCurrency(totalApplied)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">المتبقي</p>
                <p className={`text-base font-bold font-mono ${
                  Math.abs(leftover) < 0.01 ? "text-emerald-700"
                  : leftover > 0 ? "text-amber-700"
                  : "text-red-700"
                }`}>
                  {formatCurrency(leftover)}
                </p>
                {leftover > 0.01 && (
                  <p className="text-[10px] text-amber-800 mt-1">سيُسجَّل كدفعة مقدّمة</p>
                )}
                {leftover < -0.01 && (
                  <p className="text-[10px] text-red-700 mt-1">تطبيق أكثر من المستلم — أصلح</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── JE Preview ────────────────────────────────────────── */}
      {totalAmount > 0 && Math.abs(totalAmount - totalApplied - Math.max(0, leftover)) < 0.01 && (
        <Card className="mb-4 bg-muted/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3" /> معاينة القيد
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-end p-1">الحساب</th>
                  <th className="text-end p-1">الوصف</th>
                  <th className="text-end p-1">مدين</th>
                  <th className="text-end p-1">دائن</th>
                </tr>
              </thead>
              <tbody>
                {buildJournalLines().map((jl, i) => (
                  <tr key={i} className="border-b border-dashed">
                    <td className="p-1 font-mono">{jl.accountCode}</td>
                    <td className="p-1 text-muted-foreground">{jl.description}</td>
                    <td className="p-1 font-mono text-end text-emerald-700">
                      {Number(jl.debit) > 0 ? formatCurrency(Number(jl.debit)) : "—"}
                    </td>
                    <td className="p-1 font-mono text-end text-red-700">
                      {Number(jl.credit) > 0 ? formatCurrency(Number(jl.credit)) : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/40 font-bold">
                  <td colSpan={2} className="p-1 text-end">الإجمالي</td>
                  <td className="p-1 font-mono text-end text-emerald-700">{formatCurrency(totalAmount)}</td>
                  <td className="p-1 font-mono text-end text-red-700">{formatCurrency(totalAmount)}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => setLocation("/finance/receivables")}>إلغاء</Button>
        <GuardedButton
          perm="finance:create"
          onClick={handleSubmit}
          disabled={journalMut.isPending || !header.clientId || totalAmount <= 0 || !balanced}
          rateLimitAware
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {journalMut.isPending
            ? "جاري التسجيل..."
            : <><CheckCircle2 className="h-4 w-4 me-1" /> تسجيل الاستلام</>}
        </GuardedButton>
      </div>

      {!balanced && totalAmount > 0 && leftover < -0.005 && (
        <Card className="mt-3 border-red-300 bg-red-50/30">
          <CardContent className="p-3 text-xs text-red-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            تطبيق أكثر من المبلغ المستلم — قلّل قيم التطبيق
          </CardContent>
        </Card>
      )}
    </CreatePageLayout>
  );
}
