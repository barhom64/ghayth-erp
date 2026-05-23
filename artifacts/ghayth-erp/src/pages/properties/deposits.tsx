import { useState } from "react";
import { useApiQuery, asList, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageStatusBadge } from "@workspace/ui-core";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatCurrency , todayLocal } from "@/lib/formatters";
import { Plus, RotateCcw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { PageShell } from "@/components/page-shell";
import { PropertyTabsNav } from "@/components/shared/property-tabs-nav";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import {
  FormShell,
  FormNumberField,
  FormTextField,
  FormSelectField,
  FormDateField,
  FormGrid,
} from "@/components/form-shell";

const depositSchema = z.object({
  contractId: z.string().min(1, "العقد مطلوب"),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون موجبًا"),
  receivedDate: z.string().min(1, "تاريخ الاستلام مطلوب"),
  notes: z.string().trim(),
});
type DepositForm = z.infer<typeof depositSchema>;

export default function DepositsPage() {
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  // Refund dialog state. The pair of prompts that used to fire here
  // (refundAmount + refundReason) was replaced by RefundDepositDialog
  // — validation now lives in zod (refundAmount ≤ originalAmount,
  // > 0) so over-refund attempts can't even submit.
  const [refundTarget, setRefundTarget] = useState<
    { id: number; originalAmount: number } | null
  >(null);

  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["deposits", statusFilter],
    `/properties/deposits${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`
  );
  const deposits = asList(data?.data || data);

  const { data: contracts } = useApiQuery<any>(["active-contracts"], "/properties/contracts?status=active&limit=200");
  const contractList = asList(contracts?.data || contracts);

  const totalHeld = deposits.filter((d: any) => d.status === "held").reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
  const totalRefunded = deposits.filter((d: any) => d.status === "refunded").reduce((s: number, d: any) => s + Number(d.refundAmount || 0), 0);

  const createMut = useApiMutation<unknown, { contractId: number; amount: number; receivedDate: string; notes: string }>(
    "/properties/deposits",
    "POST",
    [["deposits"]],
    {
      successMessage: "تم تسجيل وديعة الضمان",
      onSuccess: () => { setShowForm(false); refetch(); },
    },
  );

  const handleSave = async (values: DepositForm) => {
    await createMut.mutateAsync({
      contractId: Number(values.contractId),
      amount: values.amount,
      receivedDate: values.receivedDate,
      notes: values.notes,
    });
  };

  const submitRefund = async (
    id: number,
    values: { refundAmount: number; refundReason: string },
  ) => {
    try {
      await apiFetch(`/properties/deposits/${id}/refund`, {
        method: "PATCH",
        body: JSON.stringify({
          refundAmount: values.refundAmount,
          refundDate: todayLocal(),
          refundReason: values.refundReason || "إنهاء العقد",
        }),
      });
      refetch();
      toast({ title: "تم استرداد الوديعة" });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="ودائع الضمان"
      subtitle="إدارة ودائع ضمان المستأجرين"
      breadcrumbs={[{ href: "/properties/dashboard", label: "إدارة الأملاك" }, { label: "ودائع الضمان" }]}
      actions={
        <GuardedButton perm="properties:create" onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="w-4 h-4 me-1" /> تسجيل وديعة
        </GuardedButton>
      }
    >
      <PropertyTabsNav />
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4 text-center"><div className="text-xl font-bold">{deposits.length}</div><div className="text-xs text-muted-foreground">إجمالي الودائع</div></CardContent></Card>
        <Card className="border-status-info-surface bg-status-info-surface">
          <CardContent className="pt-4 text-center">
            <div className="text-xl font-bold text-status-info-foreground">{formatCurrency(totalHeld)}</div>
            <div className="text-xs text-muted-foreground">ودائع محتجزة</div>
          </CardContent>
        </Card>
        <Card className="border-status-success-surface bg-status-success-surface">
          <CardContent className="pt-4 text-center">
            <div className="text-xl font-bold text-status-success-foreground">{formatCurrency(totalRefunded)}</div>
            <div className="text-xs text-muted-foreground">مُستردة</div>
          </CardContent>
        </Card>
      </div>

      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2"><CardTitle className="text-base">تسجيل وديعة ضمان</CardTitle></CardHeader>
          <CardContent>
            <FormShell
              schema={depositSchema}
              defaultValues={{ contractId: "", amount: 0, receivedDate: todayLocal(), notes: "" }}
              submitLabel="حفظ"
              secondaryActions={
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  إلغاء
                </Button>
              }
              onSubmit={async (values) => {
                await handleSave(values);
              }}
            >
              <FormGrid cols={2}>
                <FormSelectField
                  name="contractId"
                  label="العقد"
                  required
                  options={[
                    { value: "", label: "اختر عقداً" },
                    ...contractList.map((c: any) => ({
                      value: String(c.id),
                      label: `${c.tenantName} — ${c.unitNumber || `وحدة #${c.unitId}`}`,
                    })),
                  ]}
                />
                <FormNumberField name="amount" label="مبلغ الوديعة (ر.س)" required />
                <FormDateField name="receivedDate" label="تاريخ الاستلام" required />
                <FormTextField name="notes" label="ملاحظات" />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        {[{ v: "all", l: "الكل" }, { v: "held", l: "محتجزة" }, { v: "refunded", l: "مستردة" }].map(({ v, l }) => (
          <Button key={v} variant={statusFilter === v ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(v)}>{l}</Button>
        ))}
      </div>

      <div className="space-y-2">
        {deposits.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">لا توجد ودائع مسجلة</CardContent></Card>
        ) : deposits.map((d: any) => (
          <Card key={d.id} className="hover:shadow-md">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{d.tenantName}</span>
                  <span className="text-sm text-muted-foreground">— {d.unitNumber || `وحدة #${d.unitId}`} ({d.buildingName || ""})</span>
                  <PageStatusBadge status={d.status} />
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  تاريخ الاستلام: {d.receivedDate?.split("T")[0]}
                  {d.refundDate && ` · تاريخ الاسترداد: ${d.refundDate?.split("T")[0]}`}
                  {d.refundReason && ` · ${d.refundReason}`}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-end">
                  <div className="font-bold text-lg">{formatCurrency(Number(d.amount))}</div>
                  {d.refundAmount && d.refundAmount !== d.amount && (
                    <div className="text-sm text-status-success-foreground">مُسترد: {formatCurrency(Number(d.refundAmount))}</div>
                  )}
                </div>
                {d.status === "held" && (
                  <GuardedButton perm="properties:create" size="sm" variant="outline" onClick={() => setRefundTarget({ id: d.id, originalAmount: Number(d.amount) })}>
                    <RotateCcw className="w-3.5 h-3.5 me-1" /> استرداد
                  </GuardedButton>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <RefundDepositDialog
        target={refundTarget}
        onClose={() => setRefundTarget(null)}
        onSubmit={async (values) => {
          if (!refundTarget) return;
          await submitRefund(refundTarget.id, values);
          setRefundTarget(null);
        }}
      />
    </PageShell>
  );
}

// ─── Refund dialog ───────────────────────────────────────────────────────────
// Replaces the back-to-back prompt(refundAmount) + prompt(reason) pair. The
// zod schema enforces:
//   - refundAmount > 0
//   - refundAmount ≤ originalAmount  (no over-refund)
// — neither check ran in the native prompt() flow, which would `Number("")`
// → 0 on cancel and silently round non-numeric strings to NaN.

function refundSchema(originalAmount: number) {
  return z.object({
    refundAmount: z.coerce
      .number({ invalid_type_error: "أدخل رقمًا صحيحًا" })
      .positive("المبلغ يجب أن يكون أكبر من صفر")
      .max(originalAmount, `المبلغ لا يتجاوز ${originalAmount} ر.س`),
    refundReason: z.string(),
  });
}

function RefundDepositDialog(props: {
  target: { id: number; originalAmount: number } | null;
  onClose: () => void;
  onSubmit: (values: { refundAmount: number; refundReason: string }) => void | Promise<void>;
}) {
  const open = props.target !== null;
  const original = props.target?.originalAmount ?? 0;
  const schema = refundSchema(original);
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) props.onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>استرداد الوديعة</AlertDialogTitle>
          <AlertDialogDescription>
            الوديعة الأصلية: {formatCurrency(original)}. أدخل المبلغ المراد استرداده وسبب الاسترداد.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {open && (
          <FormShell
            schema={schema}
            defaultValues={{ refundAmount: original as number, refundReason: "" }}
            submitLabel="استرداد"
            secondaryActions={
              <Button type="button" variant="ghost" onClick={props.onClose}>
                إلغاء
              </Button>
            }
            onSubmit={async (values) => {
              await props.onSubmit(values);
            }}
          >
            <FormGrid cols={1}>
              <FormNumberField
                name="refundAmount"
                label="مبلغ الاسترداد"
                required
              />
              <FormTextField
                name="refundReason"
                label="سبب الاسترداد"
                placeholder="إنهاء العقد"
              />
            </FormGrid>
          </FormShell>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
