import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { PropertyTabsNav } from "@/components/shared/property-tabs-nav";
import { Plus, TrendingUp, Building2, Banknote } from "lucide-react";

const EMPTY_FORM = {
  buildingId: "",
  buyerName: "",
  buyerPhone: "",
  buyerNationalId: "",
  salePrice: "",
  bookValue: "",
  vatAmount: "",
  saleDate: new Date().toISOString().slice(0, 10),
  transferDate: "",
  notes: "",
};

export default function PropertySalesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const { data: resp, isLoading } = useApiQuery<any>(
    ["property-sales"],
    "/properties/sales"
  );
  const sales: any[] = resp?.data || [];

  const { data: buildingsResp } = useApiQuery<any>(["property-buildings-list"], "/properties/buildings");
  const buildings: any[] = buildingsResp?.data || buildingsResp || [];

  async function handleSave() {
    if (!form.buyerName.trim() || !form.salePrice || !form.saleDate) {
      toast({ variant: "destructive", title: "أدخل اسم المشتري وسعر البيع والتاريخ" });
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/properties/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId: form.buildingId ? Number(form.buildingId) : undefined,
          buyerName: form.buyerName,
          buyerPhone: form.buyerPhone || undefined,
          buyerNationalId: form.buyerNationalId || undefined,
          salePrice: Number(form.salePrice),
          bookValue: Number(form.bookValue) || 0,
          vatAmount: Number(form.vatAmount) || 0,
          saleDate: form.saleDate,
          transferDate: form.transferDate || undefined,
          notes: form.notes || undefined,
        }),
      });
      toast({ title: "تم تسجيل عملية البيع وقيد المحاسبة" });
      qc.invalidateQueries({ queryKey: ["property-sales"] });
      setOpen(false);
      setForm({ ...EMPTY_FORM });
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل التسجيل", description: err.message });
    } finally {
      setSaving(false);
    }
  }

  const totalSales = sales.reduce((s, r) => s + Number(r.salePrice || 0), 0);
  const completedCount = sales.filter(r => r.status === "completed").length;

  const columns: DataTableColumn<any>[] = [
    { key: "buildingName", header: "العقار", render: r => <span className="font-medium">{r.buildingName || "—"}</span> },
    { key: "buyerName", header: "المشتري", sortable: true },
    { key: "saleDate", header: "تاريخ البيع", sortable: true, render: r => formatDateAr(r.saleDate) },
    { key: "salePrice", header: "سعر البيع", sortable: true, render: r => <span className="font-bold text-emerald-600">{formatCurrency(Number(r.salePrice || 0))}</span> },
    { key: "bookValue", header: "القيمة الدفترية", render: r => formatCurrency(Number(r.bookValue || 0)) },
    { key: "vatAmount", header: "ضريبة القيمة المضافة", render: r => r.vatAmount ? formatCurrency(Number(r.vatAmount)) : "—" },
    { key: "status", header: "الحالة", render: r => (
      <Badge variant="outline" className={
        r.status === "completed" ? "border-emerald-200 text-emerald-600 bg-emerald-50" :
        r.status === "draft" ? "border-amber-200 text-amber-700 bg-amber-50" : ""
      }>
        {r.status === "completed" ? "مكتمل — مرحّل" : r.status === "draft" ? "مسودة — بدون قيد" : r.status === "pending" ? "قيد التنفيذ" : r.status}
      </Badge>
    )},
    { key: "buyerPhone", header: "هاتف المشتري", render: r => r.buyerPhone || "—" },
  ];

  return (
    <PageShell
      title="بيع العقارات"
      description="تسجيل عمليات بيع المباني والعقارات مع قيود المحاسبة"
    >
      <PropertyTabsNav />
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي المبيعات</p>
                <p className="text-lg font-bold text-emerald-600">{formatCurrency(totalSales)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-status-info-surface flex items-center justify-center">
                <Building2 className="h-5 w-5 text-status-info-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">العقارات المباعة</p>
                <p className="text-lg font-bold">{sales.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Banknote className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">مكتملة بقيد محاسبي</p>
                <p className="text-lg font-bold">{completedCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> سجل المبيعات
              </CardTitle>
              <GuardedButton perm="properties:create" size="sm" className="gap-1" onClick={() => setOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> تسجيل بيع
              </GuardedButton>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={columns}
              data={sales}
              isLoading={isLoading}
              emptyMessage="لا توجد عمليات بيع مسجلة"
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تسجيل بيع عقار</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div>
              <Label className="text-xs">العقار / المبنى (اختياري)</Label>
              <select
                className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={form.buildingId}
                onChange={e => setForm(f => ({ ...f, buildingId: e.target.value }))}
              >
                <option value="">— اختر مبنى —</option>
                {buildings.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">اسم المشتري *</Label>
                <Input className="h-9" value={form.buyerName} onChange={e => setForm(f => ({ ...f, buyerName: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">هاتف المشتري</Label>
                <Input className="h-9" value={form.buyerPhone} onChange={e => setForm(f => ({ ...f, buyerPhone: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">الهوية / السجل التجاري</Label>
                <Input className="h-9" value={form.buyerNationalId} onChange={e => setForm(f => ({ ...f, buyerNationalId: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">سعر البيع (ريال) *</Label>
                <Input type="number" className="h-9" value={form.salePrice} onChange={e => setForm(f => ({ ...f, salePrice: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">القيمة الدفترية (ريال)</Label>
                <Input type="number" className="h-9" value={form.bookValue} onChange={e => setForm(f => ({ ...f, bookValue: e.target.value }))} placeholder="0 — لا يوجد قيد" />
              </div>
              <div>
                <Label className="text-xs">ضريبة القيمة المضافة (ريال)</Label>
                <Input type="number" className="h-9" value={form.vatAmount} onChange={e => setForm(f => ({ ...f, vatAmount: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label className="text-xs">تاريخ البيع *</Label>
                <Input type="date" className="h-9" value={form.saleDate} onChange={e => setForm(f => ({ ...f, saleDate: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">تاريخ نقل الملكية</Label>
                <Input type="date" className="h-9" value={form.transferDate} onChange={e => setForm(f => ({ ...f, transferDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">ملاحظات</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            {form.bookValue && Number(form.bookValue) > 0 && (
              <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
                سيُنشئ النظام قيداً محاسبياً تلقائياً: DR ذمم مدينة {formatCurrency(Number(form.salePrice))} / CR أصل عقاري {formatCurrency(Number(form.bookValue))}
                {Number(form.salePrice) > Number(form.bookValue) && ` + CR مكسب ${formatCurrency(Number(form.salePrice) - Number(form.bookValue) - Number(form.vatAmount || 0))}`}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
              {saving ? "جاري الحفظ..." : "تسجيل البيع"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
