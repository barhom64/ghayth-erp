import { useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation, apiFetch } from "@/lib/api";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  FormShell,
  FormTextField,
  FormTextareaField,
  FormGrid,
} from "@workspace/ui-core";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle,
  XCircle,
  Calculator,
  Loader2,
  BarChart3,
  ShieldCheck,
  TrendingUp,
  Plus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFormContext } from "react-hook-form";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { SearchableSelectField } from "@/components/shared/searchable-select";

/**
 * Finance / Budget Approvals + Variance + Validator.
 *
 * Phase D / Finance gap. Closes 5 unused-backend endpoints
 * across the budget-governance flows that were missing a UI:
 *
 *   POST /finance/budget/validate
 *     → Interactive validator. Given an account code + amount
 *       + period, the server returns one of:
 *         no_budget / within / warning_cfo / blocked_gm /
 *         rejected. The same logic the financial-operation
 *         pre-flight checks use under the hood. Surfaces as
 *         a "Budget Calculator" tab.
 *
 *   POST /finance/budget/approval-requests
 *     → File an over-budget request when validate returns
 *       warning_cfo or blocked_gm. Captures account / period /
 *       requested amount + reason. The server auto-classifies
 *       the request as cfo or gm tier based on the resulting
 *       utilization %.
 *
 *   GET  /finance/budget/approval-requests
 *     → Pending-requests table, with status filter. The list
 *       endpoint accepts ?status=pending|approved|rejected.
 *
 *   POST /finance/budget/approval-requests/:id/decide
 *     → Approve / reject decision dialog. The backend enforces
 *       role-based gating (cfo-tier requires finance/director/
 *       owner; gm-tier requires director/owner) so the dialog
 *       just collects decision + notes.
 *
 *   GET  /finance/budget/variance
 *     → Variance report: budgeted vs. actual for the period
 *       per account, with utilization %, variance value, and
 *       a status enum (within_budget / near_limit /
 *       over_budget / no_budget). Color-coded inline bars to
 *       make over-budget rows pop visually.
 */

interface BudgetApprovalRequest {
  id: number;
  accountCode: string;
  accountName: string | null;
  period: string;
  requestedAmount: number | string;
  budgetAmount: number | string;
  utilizationBefore: number;
  utilizationAfter: number;
  approvalLevel: "cfo" | "gm" | string;
  status: "pending" | "approved" | "rejected" | string;
  sourceType: string | null;
  sourceId: number | null;
  reason: string | null;
  requestedAt: string;
}

interface ValidateResponse {
  status: "no_budget" | "within" | "warning_cfo" | "blocked_gm" | "rejected" | string;
  message: string;
  canProceed: boolean;
  utilization?: number;
  requiresApproval?: boolean;
  approvalLevel?: string;
  blocked?: boolean;
  note?: string;
}

interface VarianceLine {
  accountCode: string;
  accountName: string | null;
  accountType: string | null;
  budgetAmount: number;
  actualAmount: number;
  variance: number;
  variancePct: number;
  utilizationPct: number;
  status: "no_budget" | "over_budget" | "near_limit" | "within_budget" | string;
}

interface VarianceResponse {
  period: string;
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
  lines: VarianceLine[];
}

const currentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function BudgetApprovalsPage() {
  return (
    <PageShell
      title="حوكمة الميزانية"
      subtitle="طلبات الاعتماد، تقرير الفروقات، وأداة الفحص المسبق للميزانية"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/budget", label: "الميزانية" },
        { label: "الحوكمة" },
      ]}
    >
      <FinanceTabsNav />
      <Tabs defaultValue="approvals" dir="rtl" className="w-full">
        <TabsList>
          <TabsTrigger value="approvals" className="gap-1.5">
            <ShieldCheck className="h-4 w-4" />
            طلبات الاعتماد
          </TabsTrigger>
          <TabsTrigger value="variance" className="gap-1.5">
            <TrendingUp className="h-4 w-4" />
            تقرير الفروقات
          </TabsTrigger>
          <TabsTrigger value="validator" className="gap-1.5">
            <Calculator className="h-4 w-4" />
            فحص الميزانية
          </TabsTrigger>
        </TabsList>

        <TabsContent value="approvals" className="space-y-3">
          <ApprovalsTab />
        </TabsContent>
        <TabsContent value="variance" className="space-y-3">
          <VarianceTab />
        </TabsContent>
        <TabsContent value="validator" className="space-y-3">
          <ValidatorTab />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function ApprovalsTab() {
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [creating, setCreating] = useState(false);
  const [deciding, setDeciding] = useState<BudgetApprovalRequest | null>(null);
  const { data, isLoading, error, refetch } = useApiQuery<{ data: BudgetApprovalRequest[] }>(
    ["budget-approval-requests", statusFilter],
    `/finance/budget/approval-requests?status=${statusFilter}`,
  );
  const rows = data?.data ?? [];

  const columns: DataTableColumn<BudgetApprovalRequest>[] = [
    {
      key: "accountCode",
      header: "الحساب",
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs text-status-info-foreground" dir="ltr">
            {r.accountCode}
          </span>
          {r.accountName && <span className="text-xs text-muted-foreground">{r.accountName}</span>}
        </div>
      ),
    },
    {
      key: "period",
      header: "الفترة",
      className: "font-mono text-xs",
      ltr: true,
    },
    {
      key: "budget",
      header: "الميزانية / المطلوب",
      render: (r) => (
        <div className="text-sm">
          <div>
            ميزانية: <span className="font-medium">{Number(r.budgetAmount).toLocaleString("ar-SA")}</span>
          </div>
          <div className="text-status-warning-foreground">
            مطلوب:{" "}
            <span className="font-semibold">{Number(r.requestedAmount).toLocaleString("ar-SA")}</span>
          </div>
        </div>
      ),
    },
    {
      key: "utilization",
      header: "الاستخدام",
      render: (r) => (
        <div className="text-xs">
          <div>قبل: {Number(r.utilizationBefore).toFixed(1)}%</div>
          <div
            className={
              r.utilizationAfter > 100
                ? "text-status-error-foreground font-semibold"
                : "text-status-warning-foreground font-semibold"
            }
          >
            بعد: {Number(r.utilizationAfter).toFixed(1)}%
          </div>
        </div>
      ),
    },
    {
      key: "approvalLevel",
      header: "المستوى",
      render: (r) => (
        <Badge variant={r.approvalLevel === "gm" ? "destructive" : "secondary"}>
          {r.approvalLevel === "gm" ? "المدير العام" : "المدير المالي"}
        </Badge>
      ),
    },
    {
      key: "reason",
      header: "السبب",
      render: (r) => <span className="text-xs text-muted-foreground">{r.reason ?? "—"}</span>,
    },
    {
      key: "requestedAt",
      header: "التاريخ",
      render: (r) => new Date(r.requestedAt).toLocaleDateString("ar-SA"),
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) => (
        <Badge
          variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "outline"}
        >
          {r.status === "pending"
            ? "بانتظار البت"
            : r.status === "approved"
              ? "معتمد"
              : r.status === "rejected"
                ? "مرفوض"
                : r.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) =>
        r.status === "pending" ? (
          <GuardedButton
            perm="finance.budget:approve"
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => setDeciding(r)}
          >
            <CheckCircle className="h-3 w-3" />
            البت
          </GuardedButton>
        ) : null,
    },
  ];

  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1">
          {(["pending", "approved", "rejected"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => setStatusFilter(s)}
            >
              {s === "pending" ? "قيد البت" : s === "approved" ? "مُعتمدة" : "مرفوضة"}
            </Button>
          ))}
        </div>
        <GuardedButton
          perm="finance.budget:create"
          size="sm"
          onClick={() => setCreating(true)}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          طلب اعتماد جديد
        </GuardedButton>
      </div>

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(r) => r.id}
          emptyMessage={
            statusFilter === "pending"
              ? "لا توجد طلبات قيد البت"
              : statusFilter === "approved"
                ? "لا توجد طلبات معتمدة"
                : "لا توجد طلبات مرفوضة"
          }
        />
      </PageStateWrapper>

      {creating && (
        <CreateRequestDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            refetch();
          }}
        />
      )}
      {deciding && (
        <DecideDialog
          request={deciding}
          onClose={() => setDeciding(null)}
          onDecided={() => {
            setDeciding(null);
            refetch();
          }}
        />
      )}
    </>
  );
}

const createRequestSchema = z.object({
  accountCode: z.string().trim().min(1, "رمز الحساب مطلوب"),
  period: z.string().regex(/^\d{4}-\d{2}$/, "صيغة الفترة YYYY-MM"),
  requestedAmount: z.coerce.number().positive("المبلغ يجب أن يكون موجباً"),
  reason: z.string().optional(),
});
type CreateRequestForm = z.infer<typeof createRequestSchema>;

function CreateRequestDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const mut = useApiMutation<{ data?: BudgetApprovalRequest; status?: string }, CreateRequestForm>(
    "/finance/budget/approval-requests",
    "POST",
    [["budget-approval-requests"]],
    { successMessage: "تم إنشاء طلب الاعتماد" },
  );
  const { data: accountsData } = useApiQuery<{ data: any[] }>(
    ["accounts-list"],
    "/finance/accounts?limit=500",
  );
  const accountOptions =
    (accountsData?.data ?? [])
      .filter((a: any) => a.allowPosting !== false)
      .map((a: any) => ({ value: a.code, label: `${a.code} - ${a.name}` })) ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>طلب اعتماد تجاوز ميزانية</DialogTitle>
        </DialogHeader>
        <FormShell
          schema={createRequestSchema}
          defaultValues={{
            accountCode: "",
            period: currentPeriod(),
            requestedAmount: 0,
            reason: "",
          }}
          submitLabel="تقديم الطلب"
          secondaryActions={
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            const result = await mut.mutateAsync(values);
            if (result?.status === "auto_approved") {
              // Within-budget: server returns auto_approved without a row
              onCreated();
            } else {
              onCreated();
            }
          }}
        >
          <AccountPicker name="accountCode" options={accountOptions} label="حساب الميزانية" />
          <FormGrid cols={2}>
            <FormTextField name="period" label="الفترة" required placeholder="2026-05" />
            <FormTextField name="requestedAmount" label="المبلغ المطلوب" type="number" required />
          </FormGrid>
          <FormTextareaField name="reason" label="مبرر الطلب" rows={3} />
          <p className="text-xs text-muted-foreground">
            إذا كان الاستخدام بعد المبلغ ≤ 80% يُعتمد الطلب تلقائياً. 80-99% يحتاج المدير المالي،
            99-110% يحتاج المدير العام، وأي تجاوز ≥ 110% مرفوض نهائياً.
          </p>
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

function AccountPicker({
  name,
  options,
  label,
}: {
  name: string;
  options: Array<{ value: string; label: string }>;
  label: string;
}) {
  const { watch, setValue, formState } = useFormContext<any>();
  const value = watch(name);
  const err = (formState.errors as any)[name]?.message;
  return (
    <div className="space-y-1.5">
      <SearchableSelectField
        label={label}
        required
        options={options}
        value={value || ""}
        onValueChange={(v) =>
          setValue(name, v, { shouldDirty: true, shouldValidate: true })
        }
        placeholder="ابحث عن حساب..."
        searchPlaceholder="رقم الحساب أو الاسم..."
        emptyText="لا توجد حسابات قابلة للترحيل"
      />
      {err && <p className="text-xs text-status-error-foreground">{String(err)}</p>}
    </div>
  );
}

const decideSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  notes: z.string().optional(),
});
type DecideForm = z.infer<typeof decideSchema>;

function DecideDialog({
  request,
  onClose,
  onDecided,
}: {
  request: BudgetApprovalRequest;
  onClose: () => void;
  onDecided: () => void;
}) {
  const mut = useApiMutation<unknown, DecideForm>(
    `/finance/budget/approval-requests/${request.id}/decide`,
    "POST",
    [["budget-approval-requests"]],
    { successMessage: "تم تسجيل القرار" },
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>البت في طلب اعتماد #{request.id}</DialogTitle>
        </DialogHeader>
        <div className="rounded-md bg-surface-subtle p-3 text-sm space-y-1 mb-3">
          <div className="flex justify-between">
            <span>الحساب:</span>
            <span className="font-mono" dir="ltr">
              {request.accountCode}
            </span>
          </div>
          <div className="flex justify-between">
            <span>المبلغ المطلوب:</span>
            <span className="font-semibold">
              {Number(request.requestedAmount).toLocaleString("ar-SA")} ر.س
            </span>
          </div>
          <div className="flex justify-between">
            <span>الاستخدام بعد الموافقة:</span>
            <span className="font-semibold text-status-warning-foreground">
              {Number(request.utilizationAfter).toFixed(1)}%
            </span>
          </div>
          {request.reason && (
            <div className="border-t pt-1">
              <span className="text-xs">السبب: {request.reason}</span>
            </div>
          )}
        </div>
        <FormShell
          schema={decideSchema}
          defaultValues={{ decision: "approved", notes: "" }}
          submitLabel="حفظ القرار"
          secondaryActions={
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await mut.mutateAsync(values);
            onDecided();
          }}
        >
          <DecisionButtons />
          <FormTextareaField name="notes" label="ملاحظات (اختياري)" rows={3} />
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

function DecisionButtons() {
  const { watch, setValue } = useFormContext<DecideForm>();
  const value = watch("decision");
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        type="button"
        variant={value === "approved" ? "default" : "outline"}
        onClick={() => setValue("decision", "approved", { shouldDirty: true })}
        className="gap-1"
      >
        <CheckCircle className="h-4 w-4" />
        موافقة
      </Button>
      <Button
        type="button"
        variant={value === "rejected" ? "destructive" : "outline"}
        onClick={() => setValue("decision", "rejected", { shouldDirty: true })}
        className="gap-1"
      >
        <XCircle className="h-4 w-4" />
        رفض
      </Button>
    </div>
  );
}

function VarianceTab() {
  const [period, setPeriod] = useState(currentPeriod());
  const { data, isLoading, error, refetch } = useApiQuery<VarianceResponse>(
    ["budget-variance", period],
    `/finance/budget/variance?period=${period}`,
  );

  const STATUS_LABEL: Record<string, string> = {
    within_budget: "ضمن الميزانية",
    near_limit: "اقتراب من الحد",
    over_budget: "تجاوز",
    no_budget: "بدون ميزانية",
  };
  const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    within_budget: "default",
    near_limit: "secondary",
    over_budget: "destructive",
    no_budget: "outline",
  };

  const columns: DataTableColumn<VarianceLine>[] = [
    {
      key: "accountCode",
      header: "الحساب",
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs" dir="ltr">
            {r.accountCode}
          </span>
          {r.accountName && <span className="text-xs">{r.accountName}</span>}
        </div>
      ),
    },
    {
      key: "budgetAmount",
      header: "الميزانية",
      render: (r) => r.budgetAmount.toLocaleString("ar-SA"),
    },
    {
      key: "actualAmount",
      header: "الفعلي",
      render: (r) => r.actualAmount.toLocaleString("ar-SA"),
    },
    {
      key: "variance",
      header: "الفرق",
      render: (r) => (
        <span
          className={
            r.variance < 0
              ? "text-status-error-foreground font-semibold"
              : "text-status-success-foreground font-semibold"
          }
        >
          {r.variance.toLocaleString("ar-SA")}
        </span>
      ),
    },
    {
      key: "utilizationPct",
      header: "الاستخدام",
      render: (r) => {
        const pct = Math.min(100, Math.max(0, r.utilizationPct));
        const tone = pct > 100 ? "bg-status-error-surface" : pct > 90 ? "bg-orange-400" : "bg-status-success-surface";
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs w-12 text-end">{r.utilizationPct.toFixed(0)}%</span>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) => (
        <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
      ),
    },
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            الفترة
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <input
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="2026-05"
            className="rounded-md border bg-background px-3 py-2 text-sm font-mono w-32"
            dir="ltr"
          />
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            تحديث
          </Button>
        </CardContent>
      </Card>

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">إجمالي الميزانية</div>
                  <div className="text-xl font-semibold">
                    {data.totalBudget.toLocaleString("ar-SA")}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">إجمالي الفعلي</div>
                  <div className="text-xl font-semibold">
                    {data.totalActual.toLocaleString("ar-SA")}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">صافي الفرق</div>
                  <div
                    className={`text-xl font-semibold ${data.totalVariance < 0 ? "text-status-error-foreground" : "text-status-success-foreground"}`}
                  >
                    {data.totalVariance.toLocaleString("ar-SA")}
                  </div>
                </CardContent>
              </Card>
            </div>

            <DataTable
              columns={columns}
              data={data.lines}
              rowKey={(r) => r.accountCode}
              emptyMessage="لا توجد بيانات ميزانية لهذه الفترة"
            />
          </>
        )}
      </PageStateWrapper>
    </>
  );
}

function ValidatorTab() {
  const [accountCode, setAccountCode] = useState("");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState(currentPeriod());
  const [result, setResult] = useState<ValidateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const { data: accountsData } = useApiQuery<{ data: any[] }>(
    ["accounts-list"],
    "/finance/accounts?limit=500",
  );
  const accountOptions =
    (accountsData?.data ?? [])
      .filter((a: any) => a.allowPosting !== false)
      .map((a: any) => ({ value: a.code, label: `${a.code} - ${a.name}` })) ?? [];

  const handleValidate = async () => {
    if (!accountCode || !Number(amount)) {
      toast({ title: "اختر الحساب وأدخل المبلغ" });
      return;
    }
    setLoading(true);
    try {
      const response = await apiFetch<ValidateResponse>("/finance/budget/validate", {
        method: "POST",
        body: JSON.stringify({
          accountCode,
          amount: Number(amount),
          period,
        }),
      });
      setResult(response);
    } catch (e: any) {
      toast({ title: "خطأ في الفحص", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const statusTone =
    result?.status === "no_budget"
      ? "bg-surface-subtle text-muted-foreground"
      : result?.status === "rejected"
        ? "bg-status-error-surface text-status-error-foreground"
        : result?.status === "blocked_gm"
          ? "bg-status-error-surface text-status-error-foreground"
          : result?.status === "warning_cfo"
            ? "bg-status-warning-surface text-status-warning-foreground"
            : "bg-status-success-surface text-status-success-foreground";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Calculator className="h-4 w-4" />
          فحص الميزانية المسبق
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <SearchableSelectField
            label="الحساب"
            options={accountOptions}
            value={accountCode}
            onValueChange={setAccountCode}
            placeholder="ابحث عن حساب..."
            searchPlaceholder="رقم أو اسم..."
            emptyText="—"
          />
          <div className="space-y-1.5">
            <label className="text-sm font-medium">المبلغ المُقترح</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">الفترة</label>
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="2026-05"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
              dir="ltr"
            />
          </div>
        </div>
        <Button onClick={handleValidate} disabled={loading} className="gap-1.5">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Calculator className="h-4 w-4" />
          )}
          فحص
        </Button>

        {result && (
          <div className={`rounded-md p-4 space-y-2 ${statusTone}`}>
            <p className="font-semibold">{result.message}</p>
            {result.utilization !== undefined && (
              <p className="text-sm">
                الاستخدام المتوقع:{" "}
                <span className="font-semibold">{result.utilization.toFixed(1)}%</span>
              </p>
            )}
            {result.requiresApproval && (
              <p className="text-sm">
                مطلوب اعتماد:{" "}
                <span className="font-semibold">
                  {result.approvalLevel === "cfo"
                    ? "المدير المالي"
                    : result.approvalLevel === "gm"
                      ? "المدير العام"
                      : result.approvalLevel}
                </span>
              </p>
            )}
            {result.note && <p className="text-sm">{result.note}</p>}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          هذه الأداة تنفذ نفس الفحص الذي يجريه الخادم تلقائياً عند تسجيل أي مصروف أو فاتورة
          مورد. استخدمها قبل تقديم العملية لتفادي الرفض.
        </p>
      </CardContent>
    </Card>
  );
}
