import { useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import {
  FormShell,
  FormTextField,
  FormSelectField,
  FormTextareaField,
  FormGrid,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Edit, Calendar, TrendingDown, Loader2 } from "lucide-react";
import { formatCurrency, currentPeriodRiyadh } from "@/lib/formatters";

/**
 * Fixed Asset — detail-page actions.
 *
 * Phase D / Finance gap. Closes 3 unused-backend endpoints by
 * extending the existing detail page with the actions an
 * accountant actually needs after they open an asset:
 *
 *   PATCH /finance/fixed-assets/:id
 *     → Edit dialog. Lets ops adjust the depreciation parameters
 *       (useful life, method, salvage value) after the asset is
 *       already in service — the backend recomputes the schedule
 *       on the next depreciate call.
 *
 *   GET  /finance/fixed-assets/:id/schedule
 *     → Depreciation schedule modal. Pulls the full month-by-month
 *       projection (the backend already does the SL / DB / SYD
 *       math), useful for fiscal-year close planning + auditor
 *       walkthroughs. Falls back to a "no schedule" note for
 *       units_of_production method.
 *
 *   POST /finance/fixed-assets/:id/depreciate
 *     → Single-asset depreciation trigger. The batch endpoint
 *       (/fixed-assets/batch-depreciate, separate page) is the
 *       common path, but ops sometimes need to fire just one
 *       asset — e.g. catch-up after a backfill, or when a single
 *       asset's settings were corrected mid-month. The dialog
 *       captures the target period (YYYY-MM) and, for
 *       units_of_production, the units consumed.
 */

interface FixedAsset {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  salvageValue: number | string;
  usefulLifeYears: number | string;
  depreciationMethod: string | null;
  status: string;
  purchaseCost: number | string;
  currentBookValue: number | string;
  accumulatedDepreciation: number | string;
}

const STATUS_OPTIONS = [
  { value: "active", label: "نشط" },
  { value: "disposed", label: "تم التخلص" },
  { value: "sold", label: "تم البيع" },
  { value: "fully_depreciated", label: "مستهلك بالكامل" },
];

const METHOD_OPTIONS = [
  { value: "straight_line", label: "القسط الثابت" },
  { value: "declining_balance", label: "الرصيد المتناقص 200%" },
  { value: "declining_balance_150", label: "الرصيد المتناقص 150%" },
  { value: "sum_of_years_digits", label: "مجموع أرقام السنوات" },
  { value: "units_of_production", label: "وحدات الإنتاج" },
];

const METHOD_LABEL: Record<string, string> = Object.fromEntries(
  METHOD_OPTIONS.map((m) => [m.value, m.label]),
);

const editSchema = z.object({
  name: z.string().trim().min(1, "اسم الأصل مطلوب"),
  description: z.string().optional(),
  category: z.string().optional(),
  salvageValue: z.coerce.number().nonnegative(),
  usefulLifeYears: z.coerce.number().positive("العمر الإنتاجي يجب أن يكون أكبر من صفر"),
  depreciationMethod: z.enum([
    "straight_line",
    "declining_balance",
    "declining_balance_150",
    "sum_of_years_digits",
    "units_of_production",
  ]),
  status: z.enum(["active", "disposed", "sold", "fully_depreciated"]),
});
type EditForm = z.infer<typeof editSchema>;

// Riyadh-time YYYY-MM — UTC would flip a day early at month-end.
const currentPeriod = () => currentPeriodRiyadh();

const depreciateSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "صيغة الفترة YYYY-MM"),
  unitsThisPeriod: z.coerce.number().nonnegative().optional(),
});
type DepreciateForm = z.infer<typeof depreciateSchema>;

export function FixedAssetActions({
  asset,
  onRefresh,
}: {
  asset: FixedAsset;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [depreciating, setDepreciating] = useState(false);
  const canEdit = !["disposed", "sold"].includes(asset.status);
  const canDepreciate = asset.status === "active";

  return (
    <>
      <GuardedButton
        perm="finance:update"
        variant="outline"
        size="sm"
        onClick={() => setEditing(true)}
        disabled={!canEdit}
        className="gap-1"
      >
        <Edit className="h-4 w-4" />
        تعديل
      </GuardedButton>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowSchedule(true)}
        className="gap-1"
      >
        <Calendar className="h-4 w-4" />
        جدول الإهلاك
      </Button>
      <GuardedButton
        perm="finance:create"
        size="sm"
        onClick={() => setDepreciating(true)}
        disabled={!canDepreciate}
        className="gap-1"
      >
        <TrendingDown className="h-4 w-4" />
        إهلاك لفترة
      </GuardedButton>

      {editing && (
        <EditFixedAssetDialog
          asset={asset}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onRefresh();
          }}
        />
      )}
      {showSchedule && (
        <ScheduleDialog asset={asset} onClose={() => setShowSchedule(false)} />
      )}
      {depreciating && (
        <DepreciateDialog
          asset={asset}
          onClose={() => setDepreciating(false)}
          onDone={() => {
            setDepreciating(false);
            onRefresh();
          }}
        />
      )}
    </>
  );
}

function EditFixedAssetDialog({
  asset,
  onClose,
  onSaved,
}: {
  asset: FixedAsset;
  onClose: () => void;
  onSaved: () => void;
}) {
  const mut = useApiMutation<unknown, EditForm>(
    `/finance/fixed-assets/${asset.id}`,
    "PATCH",
    [["fixed-asset", String(asset.id)], ["fixed-assets"]],
    { successMessage: "تم تحديث الأصل" },
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-4 w-4" />
            تعديل {asset.name}
          </DialogTitle>
        </DialogHeader>
        <FormShell
          schema={editSchema}
          defaultValues={{
            name: asset.name,
            description: asset.description ?? "",
            category: asset.category ?? "",
            salvageValue: Number(asset.salvageValue) || 0,
            usefulLifeYears: Number(asset.usefulLifeYears) || 1,
            depreciationMethod:
              (asset.depreciationMethod as EditForm["depreciationMethod"]) ?? "straight_line",
            status: (asset.status as EditForm["status"]) ?? "active",
          }}
          submitLabel="حفظ التعديلات"
          secondaryActions={
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await mut.mutateAsync(values);
            onSaved();
          }}
        >
          <FormGrid cols={2}>
            <FormTextField name="name" label="اسم الأصل" required />
            <FormTextField name="category" label="الفئة" placeholder="مثل: أجهزة، أثاث..." />
          </FormGrid>
          <FormTextareaField name="description" label="الوصف" rows={2} />
          <FormGrid cols={2}>
            <FormTextField
              name="salvageValue"
              label="القيمة المتبقية بعد الإهلاك"
              type="number"
            />
            <FormTextField
              name="usefulLifeYears"
              label="العمر الإنتاجي (سنوات)"
              type="number"
              required
            />
          </FormGrid>
          <FormGrid cols={2}>
            <FormSelectField
              name="depreciationMethod"
              label="طريقة الإهلاك"
              required
              options={METHOD_OPTIONS}
            />
            <FormSelectField name="status" label="حالة الأصل" required options={STATUS_OPTIONS} />
          </FormGrid>
          <p className="text-xs text-muted-foreground">
            تغيير طريقة الإهلاك أو العمر الإنتاجي يُطبَّق على الفترات المستقبلية فقط — لا يعدّل
            القيود السابقة. لإعادة حساب فترة سابقة، استخدم "إهلاك لفترة" لاحقاً.
          </p>
        </FormShell>
      </DialogContent>
    </Dialog>
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

function ScheduleDialog({ asset, onClose }: { asset: FixedAsset; onClose: () => void }) {
  const { data, isLoading, error } = useApiQuery<ScheduleResponse>(
    ["fixed-asset-schedule", String(asset.id)],
    `/finance/fixed-assets/${asset.id}/schedule`,
  );

  const columns: DataTableColumn<ScheduleRow>[] = [
    { key: "period", header: "الفترة", className: "font-mono text-xs", ltr: true },
    {
      key: "depreciationAmount",
      header: "إهلاك الفترة",
      render: (r) => formatCurrency(r.depreciationAmount),
    },
    {
      key: "accumulatedDepreciation",
      header: "مجمع الإهلاك",
      render: (r) => formatCurrency(r.accumulatedDepreciation),
    },
    {
      key: "bookValue",
      header: "القيمة الدفترية",
      render: (r) => <span className="font-medium">{formatCurrency(r.bookValue)}</span>,
    },
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            جدول إهلاك {asset.name}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            جاري حساب الجدول...
          </div>
        ) : error ? (
          <p className="text-sm text-status-error-foreground">
            {(error as Error).message || "خطأ في تحميل الجدول"}
          </p>
        ) : data ? (
          <>
            <Card>
              <CardContent className="p-3 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">الطريقة</div>
                  <div className="font-medium">{METHOD_LABEL[data.method ?? ""] ?? data.method ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">إجمالي قابل للإهلاك</div>
                  <div className="font-semibold">{formatCurrency(data.totalDepreciable)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">عدد الفترات</div>
                  <div className="font-semibold">{data.schedule.length}</div>
                </div>
              </CardContent>
            </Card>
            {data.note ? (
              <p className="text-sm text-status-info-foreground bg-status-info-surface rounded-md p-3">
                {data.note}
              </p>
            ) : (
              <div className="overflow-y-auto flex-1">
                <DataTable
                  columns={columns}
                  data={data.schedule}
                  rowKey={(r) => r.period}
                  emptyMessage="لا يوجد جدول"
                />
              </div>
            )}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DepreciateDialog({
  asset,
  onClose,
  onDone,
}: {
  asset: FixedAsset;
  onClose: () => void;
  onDone: () => void;
}) {
  const mut = useApiMutation<{ entryId: number; depreciationAmount: number }, DepreciateForm>(
    `/finance/fixed-assets/${asset.id}/depreciate`,
    "POST",
    [["fixed-asset", String(asset.id)], ["fixed-assets"]],
    { successMessage: "تم تسجيل الإهلاك" },
  );

  const isUnitsBased = asset.depreciationMethod === "units_of_production";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            إهلاك {asset.name} لفترة
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-md bg-surface-subtle p-3 text-sm space-y-1 mb-3">
          <div className="flex justify-between">
            <span>القيمة الدفترية الحالية:</span>
            <span className="font-semibold">{formatCurrency(Number(asset.currentBookValue))}</span>
          </div>
          <div className="flex justify-between">
            <span>الطريقة:</span>
            <span>{METHOD_LABEL[asset.depreciationMethod ?? ""] ?? "—"}</span>
          </div>
        </div>
        <FormShell
          schema={depreciateSchema}
          defaultValues={{
            period: currentPeriod(),
            unitsThisPeriod: isUnitsBased ? 0 : undefined,
          }}
          submitLabel="تسجيل الإهلاك"
          secondaryActions={
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await mut.mutateAsync(values);
            onDone();
          }}
        >
          <FormTextField
            name="period"
            label="الفترة (YYYY-MM)"
            required
            placeholder="2026-05"
          />
          {isUnitsBased && (
            <FormTextField
              name="unitsThisPeriod"
              label="الوحدات المنتجة خلال الفترة"
              type="number"
              required
            />
          )}
          <p className="text-xs text-muted-foreground">
            سيتم إنشاء قيد إهلاك (مدين 6100 مصروف إهلاك / دائن 1590 مجمع إهلاك) وتحديث القيمة
            الدفترية للأصل. لا يمكن إهلاك نفس الأصل لنفس الفترة مرتين.
          </p>
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}
