import { useMemo, useState } from "react";
import { useRoute } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { FormGrid, FormTextField, FormTextareaField, FormSelectField, FormNumberField, FormShell, FormDateField } from "@workspace/ui-core";
import { EntityEditDialog } from "@/components/shared/entity-edit-dialog";
import {
  DetailPageLayout,
  type RelatedEntity,
  EntityComments,
} from "@workspace/entity-kit";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Edit, Box, TrendingDown, ArrowLeftRight, CheckCircle2, Trash2, AlertTriangle, RefreshCw } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  active: "نشط",
  disposed: "مستبعد",
  fully_depreciated: "مستهلك بالكامل",
  under_maintenance: "قيد الصيانة",
  transferred: "منقول",
  sold: "مباع",
};

const DEPRECIATION_METHODS: Record<string, string> = {
  straight_line: "القسط الثابت",
  declining_balance: "الرصيد المتناقص",
  units_of_production: "وحدات الإنتاج",
  sum_of_years: "مجموع أرقام السنوات",
};

function statusTone(status: string) {
  if (status === "active") return "success" as const;
  if (status === "disposed" || status === "sold") return "destructive" as const;
  if (status === "fully_depreciated") return "muted" as const;
  if (status === "under_maintenance") return "warning" as const;
  return "default" as const;
}

const fixedAssetEditSchema = z.object({
  name: z.string().min(1, "اسم الأصل مطلوب"),
  description: z.string().optional().default(""),
  category: z.string().optional().default(""),
  salvageValue: z.coerce.number().optional().default(0),
  usefulLifeYears: z.coerce.number().min(1, "العمر الإنتاجي يجب أن يكون أكبر من صفر"),
  depreciationMethod: z.enum(["straight_line", "double_declining", "units_of_production"]),
  status: z.enum(["active", "disposed", "sold", "under_maintenance"]),
});
type FixedAssetEditForm = z.infer<typeof fixedAssetEditSchema>;

export default function FixedAssetDetail() {
  const [, params] = useRoute("/finance/fixed-assets/:id");
  const id = params?.id ? Number(params.id) : null;
  const [editOpen, setEditOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [impairOpen, setImpairOpen] = useState(false);
  const [revalueOpen, setRevalueOpen] = useState(false);
  const { extraTabs, hideTabs } = useRegistryTabs("fixed-asset", id ?? 0);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["fixed-asset", String(id)],
    id ? `/finance/fixed-assets/${id}` : null,
    !!id,
  );

  const item = data;

  const cost = Number(item?.purchaseCost || item?.cost || 0);
  const accumulated = Number(item?.accumulatedDepreciation || 0);
  const netBook = cost - accumulated;
  const depreciationPct = cost > 0 ? (accumulated / cost) * 100 : 0;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!item) return out;
    if (item.departmentId) {
      out.push({
        type: "department",
        id: item.departmentId,
        label: item.departmentName || `قسم #${item.departmentId}`,
        sublabel: "القسم",
      });
    }
    if (item.custodianId) {
      out.push({
        type: "employee",
        id: item.custodianId,
        label: item.custodianName || `موظف #${item.custodianId}`,
        sublabel: "المسؤول عن الأصل",
        href: `/employees/${item.custodianId}`,
      });
    }
    if (item.supplierId) {
      out.push({
        type: "vendor",
        id: item.supplierId,
        label: item.supplierName || `مورد #${item.supplierId}`,
        sublabel: "المورد",
        href: `/finance/vendors/${item.supplierId}`,
      });
    }
    return out;
  }, [item]);


  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Box className="h-4 w-4 text-muted-foreground" />
            بيانات الأصل
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="border-b pb-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900">{formatCurrency(netBook)}</span>
              <span className="text-xs text-muted-foreground">ر.س قيمة دفترية</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              من أصل {formatCurrency(cost)} — مُستهلك: {depreciationPct.toFixed(1)}%
            </p>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">نسبة الاستهلاك</span>
              <span className="font-medium">{depreciationPct.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-surface-subtle rounded-full overflow-hidden">
              <div className="h-full bg-status-warning-surface0 rounded-full" style={{ width: `${Math.min(100, depreciationPct)}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {item?.category && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الفئة</p>
                <Badge variant="outline">{item.category}</Badge>
              </div>
            )}
            {item?.assetNumber && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">رقم الأصل</p>
                <span className="font-mono text-xs">{item.assetNumber}</span>
              </div>
            )}
            {item?.serialNumber && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الرقم التسلسلي</p>
                <span className="font-mono text-xs">{item.serialNumber}</span>
              </div>
            )}
            {item?.purchaseDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الشراء</p>
                <span className="text-status-neutral-foreground">{formatDateAr(item.purchaseDate)}</span>
              </div>
            )}
            {item?.usefulLife && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">العمر الافتراضي</p>
                <span className="text-status-neutral-foreground">{item.usefulLife} سنة</span>
              </div>
            )}
            {item?.depreciationMethod && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">طريقة الاستهلاك</p>
                <Badge variant="secondary">{DEPRECIATION_METHODS[item.depreciationMethod] || item.depreciationMethod}</Badge>
              </div>
            )}
            {item?.location && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">الموقع</p>
                <span className="text-status-neutral-foreground">{item.location}</span>
              </div>
            )}
          </div>

          {item?.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">الوصف</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{item.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">القيم المالية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">تكلفة الشراء</span>
              <span className="font-medium">{formatCurrency(cost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">الاستهلاك المتراكم</span>
              <span className="font-medium text-status-error-foreground">{formatCurrency(accumulated)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t">
              <span className="text-muted-foreground">القيمة الدفترية</span>
              <span className="font-bold text-emerald-600">{formatCurrency(netBook)}</span>
            </div>
            {item?.salvageValue && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">قيمة الخردة</span>
                <span className="font-medium">{formatCurrency(item.salvageValue)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {item?.custodianName && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">المسؤول عن الأصل</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="font-medium">{item.custodianName}</p>
              {item.departmentName && <p className="text-xs text-muted-foreground">{item.departmentName}</p>}
            </CardContent>
          </Card>
        )}
      </div>

      {id && <DepreciationScheduleCard assetId={Number(id)} />}

      {id && <EntityComments entityType="fixed-asset" entityId={id} />}
      {id && <EntityTags entityType="fixed-asset" entityId={id} />}
    </div>
  );

  return (
    <>
    <DetailPageLayout
      title={item?.name || "تفاصيل الأصل الثابت"}
      subtitle={item?.category}
      backPath="/finance/fixed-assets"
      refNumber={item?.ref || item?.assetNumber || (id ? `FA-${id}` : undefined)}
      status={item ? { label: STATUS_LABELS[item.status] || item.status || "-", tone: statusTone(item.status) } : undefined}
      createdAt={item?.purchaseDate || item?.createdAt}
      updatedAt={item?.updatedAt}
      createdByName={item?.createdByName}
      assignedToName={item?.custodianName}
      relatedEntities={relatedEntities}
      entityType="fixed-asset"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      actions={
        <>
          <PrintButton
            entityType="fixed_asset"
            entityId={id ?? 0}
           />
          {item?.status === "active" && (
            <GuardedButton
              perm="finance:create"
              variant="outline"
              size="sm"
              onClick={() => setRevalueOpen(true)}
            >
              <RefreshCw className="h-4 w-4 ms-1" />
              إعادة تقييم
            </GuardedButton>
          )}
          {item?.status === "active" && (
            <GuardedButton
              perm="finance:create"
              variant="outline"
              size="sm"
              onClick={() => setImpairOpen(true)}
            >
              <AlertTriangle className="h-4 w-4 ms-1" />
              هبوط قيمة
            </GuardedButton>
          )}
          {item?.status === "active" && (
            <GuardedButton
              perm="finance:create"
              variant="outline"
              size="sm"
              onClick={() => setDisposeOpen(true)}
            >
              <Trash2 className="h-4 w-4 ms-1" />
              استبعاد
            </GuardedButton>
          )}
          {item?.status === "active" && (
            <GuardedButton
              perm="finance:create"
              variant="outline"
              size="sm"
              onClick={() => setTransferOpen(true)}
            >
              <ArrowLeftRight className="h-4 w-4 ms-1" />
              نقل
            </GuardedButton>
          )}
          <GuardedButton
            perm="finance:update"
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            disabled={!item || ["disposed", "sold"].includes(item.status)}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
    {item && id && transferOpen && (
      <TransferAssetDialog
        assetId={id}
        assetName={item.name}
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onSuccess={() => { setTransferOpen(false); refetch(); }}
      />
    )}
    {item && id && disposeOpen && (
      <DisposeAssetDialog
        assetId={id}
        assetName={item.name}
        open={disposeOpen}
        onClose={() => setDisposeOpen(false)}
        onSuccess={() => { setDisposeOpen(false); refetch(); }}
      />
    )}
    {item && id && impairOpen && (
      <ImpairAssetDialog
        assetId={id}
        assetName={item.name}
        netBookValue={netBook}
        open={impairOpen}
        onClose={() => setImpairOpen(false)}
        onSuccess={() => { setImpairOpen(false); refetch(); }}
      />
    )}
    {item && id && revalueOpen && (
      <RevalueAssetDialog
        assetId={id}
        assetName={item.name}
        netBookValue={netBook}
        open={revalueOpen}
        onClose={() => setRevalueOpen(false)}
        onSuccess={() => { setRevalueOpen(false); refetch(); }}
      />
    )}
    {item && id && (
      <EntityEditDialog<FixedAssetEditForm>
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="تعديل الأصل الثابت"
        schema={fixedAssetEditSchema}
        defaultValues={{
          name: item.name ?? "",
          description: item.description ?? "",
          category: item.category ?? "",
          salvageValue: Number(item.salvageValue ?? 0),
          usefulLifeYears: Number(item.usefulLifeYears ?? 5),
          depreciationMethod: (item.depreciationMethod ?? "straight_line") as FixedAssetEditForm["depreciationMethod"],
          status: (item.status ?? "active") as FixedAssetEditForm["status"],
        }}
        endpoint={`/finance/fixed-assets/${id}`}
        invalidateKeys={[["fixed-asset", String(id)], ["fixed-assets"]]}
        onSaved={() => refetch()}
      >
        <FormGrid cols={2}>
          <FormTextField name="name" label="اسم الأصل" required className="md:col-span-2" />
          <FormTextField name="category" label="الفئة" />
          <FormSelectField
            name="status"
            label="الحالة"
            options={[
              { value: "active", label: "نشط" },
              { value: "under_maintenance", label: "تحت الصيانة" },
              { value: "disposed", label: "مستبعد" },
              { value: "sold", label: "مُباع" },
            ]}
          />
          <FormNumberField name="usefulLifeYears" label="العمر الإنتاجي (سنوات)" />
          <FormNumberField name="salvageValue" label="القيمة المتبقية" />
          <FormSelectField
            name="depreciationMethod"
            label="طريقة الإهلاك"
            options={[
              { value: "straight_line", label: "القسط الثابت" },
              { value: "double_declining", label: "القسط المتناقص المضاعف" },
              { value: "units_of_production", label: "وحدات الإنتاج" },
            ]}
          />
          <FormTextareaField name="description" label="الوصف" className="md:col-span-2" />
        </FormGrid>
      </EntityEditDialog>
    )}
    </>
  );
}

interface ScheduleRow {
  period: string;
  depreciationAmount: number;
  accumulatedDepreciation: number;
  bookValue: number;
}

interface ScheduleResponse {
  assetId: number;
  assetName: string;
  method?: string;
  schedule: ScheduleRow[];
  totalDepreciable: number;
  note?: string;
}

function DepreciationScheduleCard({ assetId }: { assetId: number }) {
  const { data, isLoading, isError, error } = useApiQuery<ScheduleResponse>(
    ["fixed-asset-schedule", String(assetId)],
    `/finance/fixed-assets/${assetId}/schedule`,
    !!assetId,
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground">جاري حساب جدول الإهلاك...</CardContent>
      </Card>
    );
  }
  if (isError) {
    const msg = (error as any)?.message ?? "تعذّر حساب جدول الإهلاك";
    return (
      <Card className="border-status-warning-surface bg-status-warning-surface/40">
        <CardContent className="p-4 text-xs text-status-warning-foreground flex items-center gap-2">
          <TrendingDown className="h-4 w-4" /> {msg}
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  if (data.note && data.schedule.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingDown className="h-4 w-4" /> جدول الإهلاك
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">{data.note}</CardContent>
      </Card>
    );
  }

  const cols: DataTableColumn<ScheduleRow>[] = [
    { key: "period", header: "الفترة",
      render: (r) => <span className="font-mono text-xs">{r.period}</span> },
    { key: "depreciationAmount", header: "إهلاك الفترة",
      render: (r) => <span className="font-mono">{formatCurrency(Number(r.depreciationAmount))}</span> },
    { key: "accumulatedDepreciation", header: "الإهلاك المتراكم",
      render: (r) => <span className="font-mono text-status-error-foreground">{formatCurrency(Number(r.accumulatedDepreciation))}</span> },
    { key: "bookValue", header: "القيمة الدفترية",
      render: (r) => <span className="font-mono font-bold text-emerald-700">{formatCurrency(Number(r.bookValue))}</span> },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4" /> جدول الإهلاك
          </span>
          <div className="flex items-center gap-2 text-xs font-normal">
            <Badge variant="outline">{data.schedule.length} فترة</Badge>
            <span className="text-muted-foreground">
              قابل للإهلاك: <span className="font-mono font-bold">{formatCurrency(data.totalDepreciable)}</span>
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <DataTable
          columns={cols} data={data.schedule}
          pageSize={24} emptyMessage="لا يوجد جدول إهلاك"
        />
      </CardContent>
    </Card>
  );
}

// ── Dispose Asset Dialog ─────────────────────────────────────────────────────

const disposeFormSchema = z.object({
  disposalDate: z.string().min(1, "تاريخ الاستبعاد مطلوب"),
  disposalType: z.enum(["sale", "scrap", "donation"]).default("sale"),
  disposalProceeds: z.coerce.number().min(0).default(0),
  reason: z.string().min(3, "سبب الاستبعاد مطلوب (3 أحرف على الأقل)"),
});
type DisposeForm = z.infer<typeof disposeFormSchema>;

function DisposeAssetDialog({
  assetId,
  assetName,
  open,
  onClose,
  onSuccess,
}: {
  assetId: number;
  assetName: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [result, setResult] = useState<{ journalEntryId: number | null; gainLoss: number } | null>(null);

  const disposeMutation = useApiMutation<any, Record<string, unknown>>(
    `/finance/fixed-assets/${assetId}/dispose`,
    "POST",
    [[`fixed-asset`, String(assetId)], ["fixed-assets"]],
    { successMessage: "تم استبعاد الأصل بنجاح" },
  );

  if (!open) return null;

  async function handleSubmit(values: DisposeForm) {
    const res = await disposeMutation.mutateAsync({
      disposalDate: values.disposalDate,
      disposalType: values.disposalType,
      disposalProceeds: values.disposalProceeds,
      reason: values.reason,
    });
    setResult({ journalEntryId: res?.journalEntryId ?? null, gainLoss: res?.gainLoss ?? 0 });
    onSuccess();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            استبعاد الأصل: {assetName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {result ? (
            <div className="space-y-4">
              <div className="bg-status-success-surface border border-status-success-surface rounded p-3 text-sm space-y-1">
                <p className="font-semibold text-status-success-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" /> تم استبعاد الأصل بنجاح
                </p>
                {result.journalEntryId && (
                  <p className="text-xs text-muted-foreground">رقم القيد: {result.journalEntryId}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {result.gainLoss >= 0
                    ? `ربح الاستبعاد: ${formatCurrency(result.gainLoss)}`
                    : `خسارة الاستبعاد: ${formatCurrency(Math.abs(result.gainLoss))}`}
                </p>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={onClose}>إغلاق</Button>
              </div>
            </div>
          ) : (
            <FormShell
              schema={disposeFormSchema}
              defaultValues={{ disposalDate: "", disposalType: "sale", disposalProceeds: 0, reason: "" }}
              submitLabel={disposeMutation.isPending ? "جاري الاستبعاد..." : "تأكيد الاستبعاد"}
              secondaryActions={
                <Button type="button" variant="outline" onClick={onClose} disabled={disposeMutation.isPending}>
                  إلغاء
                </Button>
              }
              onSubmit={handleSubmit}
            >
              <FormGrid cols={1}>
                <FormDateField name="disposalDate" label="تاريخ الاستبعاد" required />
                <FormSelectField
                  name="disposalType"
                  label="نوع الاستبعاد"
                  options={[
                    { value: "sale", label: "بيع" },
                    { value: "scrap", label: "خردة" },
                    { value: "donation", label: "تبرع" },
                  ]}
                />
                <FormNumberField name="disposalProceeds" label="عائد البيع (إن وجد)" />
                <FormTextareaField name="reason" label="سبب الاستبعاد" required rows={2} />
              </FormGrid>
            </FormShell>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Impair Asset Dialog ──────────────────────────────────────────────────────

const impairFormSchema = z.object({
  impairmentDate: z.string().min(1, "تاريخ الهبوط مطلوب"),
  impairmentAmount: z.coerce.number().positive("قيمة الانخفاض يجب أن تكون أكبر من صفر"),
  reason: z.string().min(3, "سبب الانخفاض مطلوب (3 أحرف على الأقل)"),
});
type ImpairForm = z.infer<typeof impairFormSchema>;

function ImpairAssetDialog({
  assetId,
  assetName,
  netBookValue,
  open,
  onClose,
  onSuccess,
}: {
  assetId: number;
  assetName: string;
  netBookValue: number;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [result, setResult] = useState<{ journalEntryId: number | null; newBookValue: number } | null>(null);

  const impairMutation = useApiMutation<any, Record<string, unknown>>(
    `/finance/fixed-assets/${assetId}/impair`,
    "POST",
    [[`fixed-asset`, String(assetId)], ["fixed-assets"]],
    { successMessage: "تم تسجيل انخفاض قيمة الأصل" },
  );

  if (!open) return null;

  async function handleSubmit(values: ImpairForm) {
    const res = await impairMutation.mutateAsync({
      impairmentDate: values.impairmentDate,
      impairmentAmount: values.impairmentAmount,
      reason: values.reason,
    });
    setResult({ journalEntryId: res?.journalEntryId ?? null, newBookValue: res?.newBookValue ?? 0 });
    onSuccess();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-status-warning-foreground" />
            هبوط قيمة الأصل: {assetName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {result ? (
            <div className="space-y-4">
              <div className="bg-status-success-surface border border-status-success-surface rounded p-3 text-sm space-y-1">
                <p className="font-semibold text-status-success-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" /> تم تسجيل انخفاض القيمة
                </p>
                {result.journalEntryId && (
                  <p className="text-xs text-muted-foreground">رقم القيد: {result.journalEntryId}</p>
                )}
                <p className="text-xs text-muted-foreground">القيمة الدفترية الجديدة: {formatCurrency(result.newBookValue)}</p>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={onClose}>إغلاق</Button>
              </div>
            </div>
          ) : (
            <FormShell
              schema={impairFormSchema}
              defaultValues={{ impairmentDate: "", impairmentAmount: 0, reason: "" }}
              submitLabel={impairMutation.isPending ? "جاري التسجيل..." : "تأكيد الانخفاض"}
              secondaryActions={
                <Button type="button" variant="outline" onClick={onClose} disabled={impairMutation.isPending}>
                  إلغاء
                </Button>
              }
              onSubmit={handleSubmit}
            >
              <FormGrid cols={1}>
                <FormDateField name="impairmentDate" label="تاريخ الانخفاض" required />
                <FormNumberField
                  name="impairmentAmount"
                  label={`قيمة الانخفاض (الحد الأقصى: ${formatCurrency(netBookValue)})`}
                />
                <FormTextareaField name="reason" label="سبب الانخفاض" required rows={2} />
              </FormGrid>
            </FormShell>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Revalue Asset Dialog ─────────────────────────────────────────────────────

const revalueFormSchema = z.object({
  revaluationDate: z.string().min(1, "تاريخ إعادة التقييم مطلوب"),
  revaluationDelta: z.coerce.number().refine((v) => v !== 0, "قيمة إعادة التقييم لا يمكن أن تكون صفراً"),
  reason: z.string().min(3, "سبب إعادة التقييم مطلوب (3 أحرف على الأقل)"),
});
type RevalueForm = z.infer<typeof revalueFormSchema>;

function RevalueAssetDialog({
  assetId,
  assetName,
  netBookValue,
  open,
  onClose,
  onSuccess,
}: {
  assetId: number;
  assetName: string;
  netBookValue: number;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [result, setResult] = useState<{ journalEntryId: number | null; newBookValue: number; direction: "up" | "down" } | null>(null);

  const revalueMutation = useApiMutation<any, Record<string, unknown>>(
    `/finance/fixed-assets/${assetId}/revalue`,
    "POST",
    [[`fixed-asset`, String(assetId)], ["fixed-assets"]],
    { successMessage: "تم تسجيل إعادة تقييم الأصل" },
  );

  if (!open) return null;

  async function handleSubmit(values: RevalueForm) {
    const res = await revalueMutation.mutateAsync({
      revaluationDate: values.revaluationDate,
      revaluationDelta: values.revaluationDelta,
      reason: values.reason,
    });
    setResult({
      journalEntryId: res?.journalEntryId ?? null,
      newBookValue: res?.newBookValue ?? 0,
      direction: values.revaluationDelta > 0 ? "up" : "down",
    });
    onSuccess();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            إعادة تقييم الأصل: {assetName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {result ? (
            <div className="space-y-4">
              <div className="bg-status-success-surface border border-status-success-surface rounded p-3 text-sm space-y-1">
                <p className="font-semibold text-status-success-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  {result.direction === "up" ? "تمت الزيادة في القيمة" : "تم تسجيل انخفاض التقييم"}
                </p>
                {result.journalEntryId && (
                  <p className="text-xs text-muted-foreground">رقم القيد: {result.journalEntryId}</p>
                )}
                <p className="text-xs text-muted-foreground">القيمة الدفترية الجديدة: {formatCurrency(result.newBookValue)}</p>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={onClose}>إغلاق</Button>
              </div>
            </div>
          ) : (
            <FormShell
              schema={revalueFormSchema}
              defaultValues={{ revaluationDate: "", revaluationDelta: 0, reason: "" }}
              submitLabel={revalueMutation.isPending ? "جاري التسجيل..." : "تأكيد إعادة التقييم"}
              secondaryActions={
                <Button type="button" variant="outline" onClick={onClose} disabled={revalueMutation.isPending}>
                  إلغاء
                </Button>
              }
              onSubmit={handleSubmit}
            >
              <FormGrid cols={1}>
                <FormDateField name="revaluationDate" label="تاريخ إعادة التقييم" required />
                <div className="text-xs text-muted-foreground -mb-1">
                  القيمة الدفترية الحالية: <span className="font-mono font-bold">{formatCurrency(netBookValue)}</span>
                  {" — "}أدخل قيمة موجبة للزيادة أو سالبة للنقص
                </div>
                <FormNumberField name="revaluationDelta" label="مقدار التغيير في القيمة (+ زيادة / − نقص)" />
                <FormTextareaField name="reason" label="سبب إعادة التقييم" required rows={2} />
              </FormGrid>
            </FormShell>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Transfer Asset Dialog ────────────────────────────────────────────────────

const transferFormSchema = z.object({
  toBranchId: z.string().optional().default(""),
  toDepartmentId: z.string().optional().default(""),
  toCostCenterId: z.string().optional().default(""),
  transferDate: z.string().optional().default(""),
  reason: z.string().min(3, "سبب النقل مطلوب (3 أحرف على الأقل)"),
});
type TransferForm = z.infer<typeof transferFormSchema>;

function TransferAssetDialog({
  assetId,
  assetName,
  open,
  onClose,
  onSuccess,
}: {
  assetId: number;
  assetName: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [result, setResult] = useState<{ journalEntryId: number | null; transferDate: string } | null>(null);

  const { data: branchesData } = useApiQuery<any>(["branches-list"], "/settings/branches", open);
  const { data: deptsData } = useApiQuery<any>(["departments-list"], "/settings/departments", open);
  const { data: ccData } = useApiQuery<any>(["cost-centers-list"], "/finance/cost-centers", open);

  const branches = (branchesData?.data ?? branchesData ?? []) as any[];
  const departments = (deptsData?.data ?? deptsData ?? []) as any[];
  const costCenters = (ccData?.data ?? ccData ?? []) as any[];

  const transferMutation = useApiMutation<any, Record<string, unknown>>(
    `/finance/fixed-assets/${assetId}/transfer`,
    "POST",
    [[`fixed-asset`, String(assetId)], ["fixed-assets"]],
    { successMessage: "تم نقل الأصل بنجاح" },
  );

  if (!open) return null;

  async function handleSubmit(values: TransferForm) {
    const payload: Record<string, unknown> = { reason: values.reason };
    if (values.toBranchId) payload.toBranchId = Number(values.toBranchId);
    if (values.toDepartmentId) payload.toDepartmentId = Number(values.toDepartmentId);
    if (values.toCostCenterId) payload.toCostCenterId = Number(values.toCostCenterId);
    if (values.transferDate) payload.transferDate = values.transferDate;
    const res = await transferMutation.mutateAsync(payload);
    setResult({ journalEntryId: res?.journalEntryId ?? null, transferDate: res?.transferDate ?? "" });
    onSuccess();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            نقل الأصل: {assetName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {result ? (
            <div className="space-y-4">
              <div className="bg-status-success-surface border border-status-success-surface rounded p-3 text-sm space-y-1">
                <p className="font-semibold text-status-success-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" /> تم نقل الأصل بنجاح
                </p>
                {result.journalEntryId && (
                  <p className="text-xs text-muted-foreground">رقم القيد: {result.journalEntryId}</p>
                )}
                {result.transferDate && (
                  <p className="text-xs text-muted-foreground">تاريخ النقل: {formatDateAr(result.transferDate)}</p>
                )}
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={onClose}>إغلاق</Button>
              </div>
            </div>
          ) : (
            <FormShell
              schema={transferFormSchema}
              defaultValues={{ toBranchId: "", toDepartmentId: "", toCostCenterId: "", transferDate: "", reason: "" }}
              submitLabel={transferMutation.isPending ? "جاري النقل..." : "تأكيد النقل"}
              secondaryActions={
                <Button type="button" variant="outline" onClick={onClose} disabled={transferMutation.isPending}>
                  إلغاء
                </Button>
              }
              onSubmit={handleSubmit}
            >
              <FormGrid cols={1}>
                <FormSelectField
                  name="toBranchId"
                  label="الفرع المستقبِل"
                  options={[
                    { value: "", label: "— لا تغيير —" },
                    ...branches.map((b: any) => ({ value: String(b.id), label: b.name })),
                  ]}
                />
                <FormSelectField
                  name="toDepartmentId"
                  label="القسم (اختياري)"
                  options={[
                    { value: "", label: "— لا تغيير —" },
                    ...departments.map((d: any) => ({ value: String(d.id), label: d.name })),
                  ]}
                />
                <FormSelectField
                  name="toCostCenterId"
                  label="مركز التكلفة (اختياري)"
                  options={[
                    { value: "", label: "— لا تغيير —" },
                    ...costCenters.map((c: any) => ({ value: String(c.id), label: c.name })),
                  ]}
                />
                <FormDateField name="transferDate" label="تاريخ النقل (اختياري)" />
                <FormTextareaField name="reason" label="سبب النقل" required rows={2} />
              </FormGrid>
            </FormShell>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
