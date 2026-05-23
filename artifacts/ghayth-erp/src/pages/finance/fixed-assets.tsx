import { useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@workspace/ui-core";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Building2, Plus, X, TrendingDown, Calculator, CheckCircle, DollarSign, PackageCheck } from "lucide-react";
import { Link, useLocation } from "wouter";
import { formatCurrency, formatDateAr, formatNumber, todayLocal } from "@/lib/formatters";
import { PageShell } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  FormShell,
  FormTextField,
  FormNumberField,
  FormSelectField,
  FormDateField,
  FormTextareaField,
  FormGrid,
} from "@workspace/ui-core";

const assetSchema = z.object({
  name: z.string().trim().min(1, "اسم الأصل مطلوب"),
  code: z.string().trim(),
  category: z.string().trim(),
  purchaseDate: z.string().min(1, "تاريخ الشراء مطلوب"),
  purchaseCost: z.coerce.number().positive("التكلفة يجب أن تكون موجبة"),
  salvageValue: z.coerce.number().nonnegative(),
  usefulLifeYears: z.coerce.number().int().min(1).max(50),
  depreciationMethod: z.enum(["straight_line", "declining_balance"]),
  description: z.string().trim(),
});
type AssetForm = z.infer<typeof assetSchema>;

export default function FixedAssetsPage() {
  const [, navigate] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [showDepreciate, setShowDepreciate] = useState(false);
  const [depPeriod, setDepPeriod] = useState(todayLocal().slice(0, 7));
  const [depResult, setDepResult] = useState<any>(null);
  const [batchResult, setBatchResult] = useState<any>(null);

  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["fixed-assets"], "/finance/fixed-assets");
  const assets = data?.data || [];

  const createMutation = useApiMutation<unknown, AssetForm>(
    "/finance/fixed-assets",
    "POST",
    [["fixed-assets"]],
    {
      successMessage: "تم إضافة الأصل",
      onSuccess: () => { setShowCreate(false); refetch(); },
    },
  );
  const depreciateMutation = useApiMutation(
    selectedAsset ? `/finance/fixed-assets/${selectedAsset.id}/depreciate` : "/finance/fixed-assets/0/depreciate",
    "POST"
  );
  const batchDepMutation = useApiMutation("/finance/fixed-assets/depreciate-all", "POST");

  async function handleCreate(values: AssetForm) {
    await createMutation.mutateAsync(values);
  }

  async function handleDepreciate() {
    if (!selectedAsset) return;
    try {
      const res = await depreciateMutation.mutateAsync({ period: depPeriod });
      setDepResult(res);
      refetch();
    } catch (err: any) {
      // error handled by mutation hook toast
    }
  }

  async function handleBatchDepreciate() {
    try {
      const res = await batchDepMutation.mutateAsync({ period: depPeriod });
      setBatchResult(res);
      refetch();
    } catch (err: any) {
      // error handled by mutation hook toast
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
            <GuardedButton perm="finance:approve" variant="outline" size="sm">
              <TrendingDown className="h-4 w-4 me-2" />إهلاك دفعي
            </GuardedButton>
          </Link>
          <GuardedButton perm="finance:create" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 me-1" />أصل جديد
          </GuardedButton>
        </>
      }
    >
      <KpiGrid items={[
        { label: "إجمالي الأصول", value: formatNumber(assets.length), icon: Building2, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "نشطة", value: formatNumber(assets.filter((a: any) => a.status === "active").length), icon: PackageCheck, color: "text-status-success-foreground bg-status-success-surface" },
        { label: "مجمع الإهلاك", value: formatCurrency(totalAccDep), icon: TrendingDown, color: "text-status-error-foreground bg-status-error-surface" },
        { label: "القيمة الدفترية", value: formatCurrency(totalBookValue), icon: DollarSign, color: "text-emerald-600 bg-emerald-50" },
      ]} />

      <DataTable
        columns={[
          { key: "code", header: "الكود", render: (a: any) => <span className="font-mono text-xs text-muted-foreground">{a.code || "-"}</span> },
          { key: "name", header: "الأصل", render: (a: any) => <span className="font-semibold">{a.name}</span> },
          { key: "category", header: "الفئة", render: (a: any) => <span className="text-muted-foreground text-sm">{a.category || "-"}</span> },
          { key: "purchaseDate", header: "تاريخ الشراء", render: (a: any) => <span className="text-xs text-muted-foreground">{a.purchaseDate ? formatDateAr(a.purchaseDate) : "-"}</span> },
          { key: "purchaseCost", header: "التكلفة", render: (a: any) => formatCurrency(Number(a.purchaseCost)) },
          { key: "accumulatedDepreciation", header: "مجمع الإهلاك", render: (a: any) => <span className="text-status-error-foreground">{formatCurrency(Number(a.accumulatedDepreciation ?? 0))}</span> },
          { key: "currentBookValue", header: "القيمة الدفترية", render: (a: any) => <span className="font-bold text-status-success-foreground">{formatCurrency(Number(a.currentBookValue ?? a.purchaseCost))}</span> },
          { key: "usefulLifeYears", header: "العمر (سنة)", render: (a: any) => <span className={!a.usefulLifeYears ? "text-status-error font-bold" : "text-muted-foreground"}>{a.usefulLifeYears ?? "—"}</span> },
          { key: "depreciationMethod", header: "طريقة الإهلاك", render: (a: any) => (
            <Badge variant="outline" className="text-xs">
              {a.depreciationMethod === "declining_balance" ? "القسط المتناقص" : "القسط الثابت"}
            </Badge>
          ) },
          { key: "status", header: "الحالة", render: (a: any) => <PageStatusBadge status={a.status} domain="asset" /> },
          { key: "actions", header: "", render: (a: any) => (
            <GuardedButton
              perm="finance:approve"
              variant="ghost"
              size="sm"
              onClick={() => { setSelectedAsset(a); setDepResult(null); setShowDepreciate(true); }}
            >
              <Calculator className="h-4 w-4" />
            </GuardedButton>
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
        onRowClick={(row) => navigate(`/finance/fixed-assets/${row.id}`)}
      />

      {showCreate && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">إضافة أصل ثابت</CardTitle>
          </CardHeader>
          <CardContent>
            <FormShell
              schema={assetSchema}
              defaultValues={{
                name: "",
                code: "",
                category: "",
                purchaseDate: "",
                purchaseCost: 0,
                salvageValue: 0,
                usefulLifeYears: 5,
                depreciationMethod: "straight_line" as const,
                description: "",
              }}
              submitLabel="حفظ الأصل"
              secondaryActions={
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                  <X className="w-4 h-4 me-1" /> إلغاء
                </Button>
              }
              onSubmit={async (values) => {
                await handleCreate(values);
              }}
            >
              <FormGrid cols={2}>
                <FormTextField name="name" label="اسم الأصل" required />
                <FormTextField name="code" label="الكود" />
                <FormTextField name="category" label="الفئة" placeholder="مثال: معدات، مباني" />
                <FormDateField name="purchaseDate" label="تاريخ الشراء" required />
                <FormNumberField name="purchaseCost" label="تكلفة الشراء (﷼)" required />
                <FormNumberField name="salvageValue" label="قيمة الخردة (﷼)" />
                <FormNumberField name="usefulLifeYears" label="العمر الإنتاجي (سنوات)" />
                <FormSelectField
                  name="depreciationMethod"
                  label="طريقة الإهلاك"
                  options={[
                    { value: "straight_line", label: "القسط الثابت" },
                    { value: "declining_balance", label: "القسط المتناقص" },
                  ]}
                />
                <FormTextareaField name="description" label="الوصف" className="col-span-2" rows={2} />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}

      {showDepreciate && selectedAsset && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle className="text-base">إهلاك: {selectedAsset.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-surface-subtle p-3 rounded text-sm space-y-1">
                <div className="flex justify-between"><span>القيمة الدفترية الحالية:</span><span className="font-bold">{formatCurrency(Number(selectedAsset.currentBookValue ?? selectedAsset.purchaseCost))}</span></div>
                <div className="flex justify-between"><span>مجمع الإهلاك:</span><span className="text-status-error-foreground">{formatCurrency(Number(selectedAsset.accumulatedDepreciation ?? 0))}</span></div>
                <div className="flex justify-between"><span>طريقة الإهلاك:</span><span>{selectedAsset.depreciationMethod === "declining_balance" ? "متناقص" : "ثابت"}</span></div>
              </div>
              <div>
                <Label>الفترة (YYYY-MM)</Label>
                <Input type="month" value={depPeriod} onChange={e => setDepPeriod(e.target.value)} />
              </div>
              {depResult && (
                <div className="bg-status-success-surface p-3 rounded border border-status-success-surface">
                  <p className="font-semibold text-status-success-foreground flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" />تم تسجيل الإهلاك
                  </p>
                  <p className="text-sm mt-1">مبلغ الإهلاك: {formatCurrency(depResult.depreciationAmount)}</p>
                  <p className="text-sm">القيمة الدفترية الجديدة: {formatCurrency(depResult.newBookValue)}</p>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setShowDepreciate(false); setDepResult(null); }}>إغلاق</Button>
                <Button onClick={handleDepreciate} disabled={depreciateMutation.isPending} rateLimitAware>
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
