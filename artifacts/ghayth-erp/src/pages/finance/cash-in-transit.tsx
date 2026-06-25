import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { GuardedButton } from "@/components/shared/permission-gate";
import { AccountSelect } from "@/components/shared/entity-selects";
import { isMoneyAccount } from "@/lib/finance-account-usage";
import { useToast } from "@/hooks/use-toast";
import { Plus, CheckCircle2, ArrowLeftRight } from "lucide-react";
import { formatDateAr, formatCurrency, todayLocal } from "@/lib/formatters";
import { DataTable, type DataTableColumn, PageShell, PageStatusBadge } from "@workspace/ui-core";
import { useAppContext } from "@/contexts/app-context";
import { PageStateWrapper } from "@/components/shared/page-state";

/**
 * النقد في الطريق (#2714) — تحويلات الخزائن/البنوك العابرة. طوران: إرسال
 * (مدين المقاصّة/دائن المصدر) ثم تأكيد وصول (مدين الهدف/دائن المقاصّة).
 */
const emptyForm = {
  sourceAccountCode: "", destinationAccountCode: "", clearingAccountCode: "",
  amount: "", sentDate: todayLocal(), reference: "", notes: "",
};

export default function CashInTransitPage() {
  const { scopeQueryString } = useAppContext();
  const { toast } = useToast();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["cash-in-transit", scopeQueryString],
    `/finance/cash-in-transit${scopeSuffix}`,
  );
  const items: any[] = data?.data || [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(items);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>(emptyForm);

  const createMut = useApiMutation<any, any>("/finance/cash-in-transit", "POST", [["cash-in-transit"], ["journal"]], {
    onSuccess: () => { setShowForm(false); setForm(emptyForm); refetch(); toast({ title: "تم تسجيل التحويل (نقد في الطريق)" }); },
  });
  const confirmMut = useApiMutation<any, any>((b) => `/finance/cash-in-transit/${b.id}/confirm`, "POST", [["cash-in-transit"], ["journal"]], {
    onSuccess: () => { refetch(); toast({ title: "تم تأكيد وصول التحويل" }); },
  });

  const submit = () => {
    if (!form.sourceAccountCode || !form.destinationAccountCode || !form.clearingAccountCode) { toast({ variant: "destructive", title: "اختر الحسابات الثلاثة" }); return; }
    if (form.sourceAccountCode === form.destinationAccountCode) { toast({ variant: "destructive", title: "المصدر والهدف لا يكونان نفس الحساب" }); return; }
    if (!(Number(form.amount) > 0)) { toast({ variant: "destructive", title: "أدخل مبلغًا موجبًا" }); return; }
    createMut.mutate({
      sourceAccountCode: form.sourceAccountCode, destinationAccountCode: form.destinationAccountCode,
      clearingAccountCode: form.clearingAccountCode, amount: Number(form.amount),
      sentDate: form.sentDate, reference: form.reference || undefined, notes: form.notes || undefined,
    });
  };

  const columns: DataTableColumn<any>[] = [
    { key: "sentDate", header: "تاريخ الإرسال", sortable: true, render: (t) => formatDateAr(t.sentDate) },
    { key: "sourceAccountCode", header: "من", render: (t) => <span className="font-mono text-xs">{t.sourceAccountCode}</span> },
    { key: "destinationAccountCode", header: "إلى", render: (t) => <span className="font-mono text-xs">{t.destinationAccountCode}</span> },
    { key: "amount", header: "المبلغ", sortable: true, render: (t) => formatCurrency(Number(t.amount)) },
    { key: "status", header: "الحالة", render: (t) => <PageStatusBadge status={t.status === "in_transit" ? "pending" : t.status === "arrived" ? "active" : "inactive"}>{t.status === "in_transit" ? "في الطريق" : t.status === "arrived" ? "وصل" : "ملغى"}</PageStatusBadge> },
    {
      key: "_a", header: "إجراء", render: (t) => t.status === "in_transit" ? (
        <GuardedButton perm="finance:create" variant="outline" size="sm" onClick={() => confirmMut.mutate({ id: t.id })} disabled={confirmMut.isPending}>
          <CheckCircle2 className="h-4 w-4 me-1 text-emerald-600" /> تأكيد الوصول
        </GuardedButton>
      ) : <span className="text-xs text-muted-foreground">—</span>,
    },
  ];

  return (
    <PageShell
      title="النقد في الطريق"
      subtitle="تحويلات الخزائن/البنوك العابرة — تُسجَّل عند الإرسال وتُؤكَّد عند الوصول"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "النقد في الطريق" }]}
      loading={isLoading}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_finance_cash_in_transit"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "النقد في الطريق", total: printRows.length },
              items: printRows.map((r: any) => ({
                "تاريخ الإرسال": r.sentDate,
                "من": r.sourceAccountCode,
                "إلى": r.destinationAccountCode,
                "المبلغ": formatCurrency(Number(r.amount)),
                "الحالة": r.status === "in_transit" ? "في الطريق" : r.status === "arrived" ? "وصل" : "ملغى",
              })),
            })}
          />
          <GuardedButton perm="finance:create" size="sm" onClick={() => { setForm(emptyForm); setShowForm(true); }}><Plus className="h-4 w-4 me-1" /> تحويل جديد</GuardedButton>
        </div>
      }
    >
      <FinanceTabsNav />

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()} emptyText="لا توجد تحويلات عابرة">
        <DataTable columns={columns} data={items} onSortedDataChange={setPrintRows} pageSize={20} emptyMessage="لا توجد تحويلات" />
      </PageStateWrapper>

      <Dialog open={showForm} onOpenChange={(o) => { if (!o) { setShowForm(false); setForm(emptyForm); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ArrowLeftRight className="h-5 w-5" /> تحويل نقد في الطريق</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">من حساب (المصدر) *</Label>
              <AccountSelect value={form.sourceAccountCode} onChange={(v) => setForm({ ...form, sourceAccountCode: String(v ?? "") })} placeholder="الخزنة/البنك المصدر" filter={(a: any) => isMoneyAccount(a)} />
            </div>
            <div>
              <Label className="text-xs">حساب النقد في الطريق (المقاصّة) *</Label>
              <AccountSelect value={form.clearingAccountCode} onChange={(v) => setForm({ ...form, clearingAccountCode: String(v ?? "") })} placeholder="حساب وسيط — نقد في الطريق" />
            </div>
            <div>
              <Label className="text-xs">إلى حساب (الهدف) *</Label>
              <AccountSelect value={form.destinationAccountCode} onChange={(v) => setForm({ ...form, destinationAccountCode: String(v ?? "") })} placeholder="الخزنة/البنك الهدف" filter={(a: any) => isMoneyAccount(a)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">المبلغ *</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="font-mono" /></div>
              <div><Label className="text-xs">تاريخ الإرسال</Label><Input type="date" value={form.sentDate} onChange={(e) => setForm({ ...form, sentDate: e.target.value })} /></div>
            </div>
            <div><Label className="text-xs">مرجع</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="اختياري" /></div>
            <p className="text-[11px] text-muted-foreground">
              عند الإرسال: مدين «النقد في الطريق» / دائن المصدر. عند تأكيد الوصول: مدين الهدف / دائن «النقد في الطريق».
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setForm(emptyForm); }}>إلغاء</Button>
            <Button onClick={submit} disabled={createMut.isPending}>{createMut.isPending ? "جاري التسجيل..." : "تسجيل الإرسال"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
