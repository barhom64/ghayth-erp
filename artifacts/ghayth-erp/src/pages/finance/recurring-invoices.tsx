import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { GuardedButton } from "@/components/shared/permission-gate";
import { ClientSelect } from "@/components/shared/entity-selects";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Play, Trash2, X } from "lucide-react";
import { formatDateAr, formatCurrency, todayLocal } from "@/lib/formatters";
import { DataTable, type DataTableColumn, PageShell, PageStatusBadge } from "@workspace/ui-core";
import { useAppContext } from "@/contexts/app-context";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { PageStateWrapper } from "@/components/shared/page-state";

/**
 * الفوترة المتكررة للعملاء — إدارة القوالب + التوليد. القالب يولّد فاتورة فعلية
 * عبر مسار الترحيل القائم (financialEngine.postSalesInvoice). #كلها.
 */
const FREQUENCY_LABEL: Record<string, string> = {
  daily: "يومي", weekly: "أسبوعي", monthly: "شهري", quarterly: "ربع سنوي", yearly: "سنوي",
};
const emptyLine = { description: "", quantity: 1, unitPriceExclTax: 0 };
const emptyForm = {
  clientId: "", title: "", frequency: "monthly", startDate: todayLocal(),
  dueInDays: 30, lines: [{ ...emptyLine }],
};

export default function RecurringInvoicesPage() {
  const { scopeQueryString } = useAppContext();
  const { toast } = useToast();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["recurring-invoices", scopeQueryString],
    `/finance/recurring-invoices${scopeSuffix}`,
  );
  const items: any[] = data?.data || [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(items);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>(emptyForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const createMut = useApiMutation<any, any>("/finance/recurring-invoices", "POST", [["recurring-invoices"]], {
    onSuccess: () => { setShowForm(false); setForm(emptyForm); refetch(); toast({ title: "تم إنشاء القالب" }); },
  });
  const runMut = useApiMutation<any, any>((b) => `/finance/recurring-invoices/${b.id}/run`, "POST", [["recurring-invoices"], ["invoices"]], {
    onSuccess: (r: any) => { refetch(); toast({ title: "تم توليد الفاتورة", description: r?.invoiceNumber ? `رقم: ${r.invoiceNumber}` : undefined }); },
  });

  const setLine = (i: number, patch: any) => setForm((f: any) => ({ ...f, lines: f.lines.map((l: any, idx: number) => idx === i ? { ...l, ...patch } : l) }));
  const addLine = () => setForm((f: any) => ({ ...f, lines: [...f.lines, { ...emptyLine }] }));
  const removeLine = (i: number) => setForm((f: any) => ({ ...f, lines: f.lines.filter((_: any, idx: number) => idx !== i) }));

  const submit = () => {
    if (!form.clientId || !form.title) { toast({ variant: "destructive", title: "العميل والعنوان مطلوبان" }); return; }
    const lines = form.lines.filter((l: any) => l.description && Number(l.quantity) > 0);
    if (lines.length === 0) { toast({ variant: "destructive", title: "أضف سطرًا واحدًا على الأقل" }); return; }
    createMut.mutate({
      clientId: Number(form.clientId), title: form.title, frequency: form.frequency,
      startDate: form.startDate, dueInDays: Number(form.dueInDays) || 30,
      lines: lines.map((l: any) => ({ description: l.description, quantity: Number(l.quantity), unitPriceExclTax: Number(l.unitPriceExclTax) || 0 })),
    });
  };

  const columns: DataTableColumn<any>[] = [
    { key: "title", header: "العنوان", sortable: true, render: (t) => <span className="font-medium">{t.title}</span> },
    { key: "clientName", header: "العميل", render: (t) => t.clientName || `#${t.clientId}` },
    { key: "frequency", header: "التكرار", render: (t) => <Badge variant="outline">{FREQUENCY_LABEL[t.frequency] || t.frequency}</Badge> },
    { key: "nextRunDate", header: "الاستحقاق التالي", sortable: true, render: (t) => formatDateAr(t.nextRunDate) },
    { key: "runsCount", header: "مرات التوليد", render: (t) => t.runsCount ?? 0 },
    { key: "active", header: "الحالة", render: (t) => <PageStatusBadge status={t.active ? "active" : "inactive"} /> },
    {
      key: "_a", header: "إجراءات", render: (t) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <GuardedButton perm="finance:create" variant="ghost" size="sm" title="توليد فاتورة الآن"
            onClick={() => runMut.mutate({ id: t.id })} disabled={runMut.isPending}>
            <Play className="h-4 w-4 text-emerald-600" />
          </GuardedButton>
          <Button variant="ghost" size="sm" className="text-status-error" title="حذف" onClick={() => setDeleteId(t.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="الفوترة المتكررة"
      subtitle="قوالب فواتير تتولّد تلقائيًا على جدول (اشتراكات/إيجارات دورية)"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "الفوترة المتكررة" }]}
      loading={isLoading}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_finance_recurring_invoices"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "الفوترة المتكررة", total: printRows.length },
              items: printRows.map((r: any) => Object.fromEntries(
                columns.filter((c: any) => c.header && !/_?select|action|إجراء/i.test(String(c.key)))
                  .map((c: any) => [c.header, r[c.key] ?? "—"]),
              )),
            })}
          />
          <GuardedButton perm="finance:create" size="sm" onClick={() => { setForm(emptyForm); setShowForm(true); }}><Plus className="h-4 w-4 me-1" /> قالب جديد</GuardedButton>
        </div>
      }
    >
      <FinanceTabsNav />

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()} emptyText="لا توجد قوالب فوترة متكررة">
        <DataTable columns={columns} data={items} onSortedDataChange={setPrintRows} pageSize={20} emptyMessage="لا توجد قوالب" />
      </PageStateWrapper>

      <Dialog open={showForm} onOpenChange={(o) => { if (!o) { setShowForm(false); setForm(emptyForm); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>قالب فوترة متكررة</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2"><ClientSelect value={form.clientId} onChange={(v) => setForm({ ...form, clientId: String(v ?? "") })} label="العميل *" /></div>
              <div><Label className="text-xs">العنوان *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="اشتراك صيانة شهري" /></div>
              <div>
                <Label className="text-xs">التكرار</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(FREQUENCY_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">تاريخ البداية / أول استحقاق</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
              <div><Label className="text-xs">مهلة الاستحقاق (أيام)</Label><Input type="number" value={form.dueInDays} onChange={(e) => setForm({ ...form, dueInDays: e.target.value })} /></div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">سطور الفاتورة</Label>
                <Button variant="outline" size="sm" onClick={addLine}><Plus className="h-3 w-3 me-1" />سطر</Button>
              </div>
              {form.lines.map((l: any, i: number) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <Input className="col-span-6" placeholder="الوصف" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                  <Input className="col-span-2" type="number" placeholder="الكمية" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                  <Input className="col-span-3" type="number" placeholder="السعر (بدون ضريبة)" value={l.unitPriceExclTax} onChange={(e) => setLine(i, { unitPriceExclTax: e.target.value })} />
                  <Button variant="ghost" size="icon" className="col-span-1 text-status-error" onClick={() => removeLine(i)} disabled={form.lines.length <= 1}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground text-end">
                الإجمالي (بدون ضريبة): {formatCurrency(form.lines.reduce((s: number, l: any) => s + (Number(l.quantity) || 0) * (Number(l.unitPriceExclTax) || 0), 0))}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setForm(emptyForm); }}>إلغاء</Button>
            <Button onClick={submit} disabled={createMut.isPending}>{createMut.isPending ? "جاري الحفظ..." : "حفظ القالب"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteId !== null}
        onOpenChange={(v) => { if (!v) setDeleteId(null); }}
        entity={{ type: "recurring-invoice", id: deleteId ?? 0, name: "قالب الفوترة المتكررة" }}
        deletePath={`/finance/recurring-invoices/${deleteId}`}
        invalidateKeys={[["recurring-invoices"]]}
        successMessage="تم حذف القالب"
        onDeleted={() => { setDeleteId(null); refetch(); }}
      />
    </PageShell>
  );
}
