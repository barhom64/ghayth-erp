import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Building2, Plus, TrendingDown, Calculator, CheckCircle, DollarSign, PackageCheck } from "lucide-react";
import { Link } from "wouter";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export default function FixedAssetsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [showDepreciate, setShowDepreciate] = useState(false);
  const [depPeriod, setDepPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [depResult, setDepResult] = useState<any>(null);
  const [batchResult, setBatchResult] = useState<any>(null);

  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["fixed-assets"], "/finance/fixed-assets");
  const assets = data?.data || [];

  const createMutation = useApiMutation("/finance/fixed-assets", "POST");
  const depreciateMutation = useApiMutation(
    selectedAsset ? `/finance/fixed-assets/${selectedAsset.id}/depreciate` : "/finance/fixed-assets/0/depreciate",
    "POST"
  );
  const batchDepMutation = useApiMutation("/finance/fixed-assets/depreciate-all", "POST");

  const [form, setForm] = useState({
    name: "", code: "", category: "", purchaseDate: "", purchaseCost: "", salvageValue: "0",
    usefulLifeYears: "5", depreciationMethod: "straight_line", description: "",
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({
        ...form,
        purchaseCost: Number(form.purchaseCost),
        salvageValue: Number(form.salvageValue),
        usefulLifeYears: Number(form.usefulLifeYears),
      });
      setShowCreate(false);
      setForm({ name: "", code: "", category: "", purchaseDate: "", purchaseCost: "", salvageValue: "0", usefulLifeYears: "5", depreciationMethod: "straight_line", description: "" });
      refetch();
    } catch (err: any) {
      console.error(err);
    }
  }

  async function handleDepreciate() {
    if (!selectedAsset) return;
    try {
      const res = await depreciateMutation.mutateAsync({ period: depPeriod });
      setDepResult(res);
      refetch();
    } catch (err: any) {
      console.error(err);
    }
  }

  async function handleBatchDepreciate() {
    try {
      const res = await batchDepMutation.mutateAsync({ period: depPeriod });
      setBatchResult(res);
      refetch();
    } catch (err: any) {
      console.error(err);
    }
  }

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const totalCost = assets.reduce((s: number, a: any) => s + Number(a.purchaseCost ?? 0), 0);
  const totalBookValue = assets.reduce((s: number, a: any) => s + Number(a.currentBookValue ?? 0), 0);
  const totalAccDep = assets.reduce((s: number, a: any) => s + Number(a.accumulatedDepreciation ?? 0), 0);

  return (
    <PageShell
      title="الأصول الثابتة والإهلاك"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "الأصول الثابتة والإهلاك" }]}
      loading={isLoading}
      actions={
        <>
          <Link href="/finance/fixed-assets/batch-depreciate">
            <Button variant="outline" size="sm">
              <TrendingDown className="h-4 w-4 me-2" />إهلاك دفعي
            </Button>
          </Link>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 me-1" />أصل جديد
          </Button>
        </>
      }
    >
      <KpiGrid items={[
        { label: "إجمالي الأصول", value: formatNumber(assets.length), icon: Building2, color: "text-blue-600 bg-blue-50" },
        { label: "نشطة", value: formatNumber(assets.filter((a: any) => a.status === "active").length), icon: PackageCheck, color: "text-green-600 bg-green-50" },
        { label: "مجمع الإهلاك", value: formatCurrency(totalAccDep), icon: TrendingDown, color: "text-red-600 bg-red-50" },
        { label: "القيمة الدفترية", value: formatCurrency(totalBookValue), icon: DollarSign, color: "text-emerald-600 bg-emerald-50" },
      ]} />

      <DataTable
        columns={[
          { key: "code", header: "الكود", render: (a: any) => <span className="font-mono text-xs text-gray-500">{a.code || "-"}</span> },
          { key: "name", header: "الأصل", render: (a: any) => <span className="font-semibold">{a.name}</span> },
          { key: "category", header: "الفئة", render: (a: any) => <span className="text-gray-500 text-sm">{a.category || "-"}</span> },
          { key: "purchaseDate", header: "تاريخ الشراء", render: (a: any) => <span className="text-xs text-gray-500">{a.purchaseDate ? formatDateAr(a.purchaseDate) : "-"}</span> },
          { key: "purchaseCost", header: "التكلفة", render: (a: any) => formatCurrency(Number(a.purchaseCost)) },
          { key: "accumulatedDepreciation", header: "مجمع الإهلاك", render: (a: any) => <span className="text-red-600">{formatCurrency(Number(a.accumulatedDepreciation ?? 0))}</span> },
          { key: "currentBookValue", header: "القيمة الدفترية", render: (a: any) => <span className="font-bold text-green-600">{formatCurrency(Number(a.currentBookValue ?? a.purchaseCost))}</span> },
          { key: "usefulLifeYears", header: "العمر (سنة)", render: (a: any) => <span className={!a.usefulLifeYears ? "text-red-500 font-bold" : "text-gray-600"}>{a.usefulLifeYears ?? "—"}</span> },
          { key: "depreciationMethod", header: "طريقة الإهلاك", render: (a: any) => (
            <Badge variant="outline" className="text-xs">
              {a.depreciationMethod === "declining_balance" ? "القسط المتناقص" : "القسط الثابت"}
            </Badge>
          ) },
          { key: "status", header: "الحالة", render: (a: any) => <PageStatusBadge status={a.status} domain="asset" /> },
          { key: "actions", header: "", render: (a: any) => (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSelectedAsset(a); setDepResult(null); setShowDepreciate(true); }}
            >
              <Calculator className="h-4 w-4" />
            </Button>
          ) },
        ] as DataTableColumn<any>[]}
        data={assets}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد أصول ثابتة مسجلة"
        emptyIcon={<Building2 className="h-6 w-6 text-slate-400" />}
        searchPlaceholder={null}
      />

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>إضافة أصل ثابت</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>اسم الأصل *</Label>
                    <Input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>الكود</Label>
                    <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
                  </div>
                  <div>
                    <Label>الفئة</Label>
                    <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="مثال: معدات، مباني" />
                  </div>
                  <div>
                    <Label>تاريخ الشراء *</Label>
                    <Input type="date" required value={form.purchaseDate} onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label>تكلفة الشراء (﷼) *</Label>
                    <Input type="number" required min="1" step="0.01" value={form.purchaseCost} onChange={e => setForm(f => ({ ...f, purchaseCost: e.target.value }))} />
                  </div>
                  <div>
                    <Label>قيمة الخردة (﷼)</Label>
                    <Input type="number" min="0" step="0.01" value={form.salvageValue} onChange={e => setForm(f => ({ ...f, salvageValue: e.target.value }))} />
                  </div>
                  <div>
                    <Label>العمر الإنتاجي (سنوات)</Label>
                    <Input type="number" min="1" max="50" value={form.usefulLifeYears} onChange={e => setForm(f => ({ ...f, usefulLifeYears: e.target.value }))} />
                  </div>
                  <div>
                    <Label>طريقة الإهلاك</Label>
                    <Select value={form.depreciationMethod} onValueChange={v => setForm(f => ({ ...f, depreciationMethod: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="straight_line">القسط الثابت</SelectItem>
                        <SelectItem value="declining_balance">القسط المتناقص</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>الوصف</Label>
                  <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "جارٍ الحفظ..." : "حفظ الأصل"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {showDepreciate && selectedAsset && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle className="text-base">إهلاك: {selectedAsset.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gray-50 p-3 rounded text-sm space-y-1">
                <div className="flex justify-between"><span>القيمة الدفترية الحالية:</span><span className="font-bold">{formatCurrency(Number(selectedAsset.currentBookValue ?? selectedAsset.purchaseCost))}</span></div>
                <div className="flex justify-between"><span>مجمع الإهلاك:</span><span className="text-red-600">{formatCurrency(Number(selectedAsset.accumulatedDepreciation ?? 0))}</span></div>
                <div className="flex justify-between"><span>طريقة الإهلاك:</span><span>{selectedAsset.depreciationMethod === "declining_balance" ? "متناقص" : "ثابت"}</span></div>
              </div>
              <div>
                <Label>الفترة (YYYY-MM)</Label>
                <Input type="month" value={depPeriod} onChange={e => setDepPeriod(e.target.value)} />
              </div>
              {depResult && (
                <div className="bg-green-50 p-3 rounded border border-green-200">
                  <p className="font-semibold text-green-700 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" />تم تسجيل الإهلاك
                  </p>
                  <p className="text-sm mt-1">مبلغ الإهلاك: {formatCurrency(depResult.depreciationAmount)}</p>
                  <p className="text-sm">القيمة الدفترية الجديدة: {formatCurrency(depResult.newBookValue)}</p>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setShowDepreciate(false); setDepResult(null); }}>إغلاق</Button>
                <Button onClick={handleDepreciate} disabled={depreciateMutation.isPending}>
                  {depreciateMutation.isPending ? "جارٍ الإهلاك..." : "تسجيل الإهلاك"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
