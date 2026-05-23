import { useState } from "react";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  FormShell,
  FormTextField,
  FormNumberField,
  FormSelectField,
  FormDateField,
  FormGrid,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
  PageShell,
  PageStatusBadge,
} from "@workspace/ui-core";
import {
  KeyRound,
  DollarSign,
  Plus,
  X,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Eye,
  BarChart3,
} from "lucide-react";
import { ApprovalActions, ActionHistory } from "@workspace/workflow-kit";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useAppContext } from "@/contexts/app-context";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

/**
 * Custodies list — migrated in R.3 iter 3 to the unified template stack.
 *
 * Before: raw <h1>, a local `statusMap` with literal tailwind classes
 * (but no template literals this time — still duplicated across pages),
 * two inline sub-forms that each carried their own `useToast` +
 * `useQueryClient` + try/catch wrapper around `useApiMutation`.
 *
 * After:
 *   • PageShell with title, subtitle, breadcrumbs, actions slot (report
 *     + "new custody" toggle).
 *   • PageStatusBadge with a new `custody` domain covering the seven
 *     states (active / partial / settled / pending / rejected /
 *     returned / overdue) — added to STATUS_MAP in the same commit as
 *     this file so the canonical arabic labels + tones live in one
 *     place.
 *   • CreateCustodyForm + SettleCustodyForm drop their manual
 *     toast/invalidate plumbing and rely on the hook's built-in
 *     successMessage + invalidateKeys, letting CONFLICT / VALIDATION /
 *     FORBIDDEN errors flow through R.1.2's typed-error toast pipeline
 *     automatically.
 *
 * The expansion pattern (click chevron → show ApprovalActions +
 * ActionHistory inline) is preserved — those helpers are already
 * unified and canonical.
 *
 * No endpoint, payload, or row-click behaviour changed.
 */

const EMPTY_OBJ = {} as Record<string, unknown>;

interface CustodySummary {
  total?: number;
  totalAmount?: number | string;
  totalRemaining?: number | string;
  activeCount?: number;
  overdueCount?: number;
}

export default function CustodiesPage() {
  const [, navigate] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["custodies", scopeQueryString],
    `/finance/custodies${scopeSuffix}`,
  );
  const items = data?.data || [];
  const summary: CustodySummary = data?.summary || EMPTY_OBJ;
  const [filters, setFilters] = useFilters();
  const [showForm, setShowForm] = useState(false);
  const [settleTarget, setSettleTarget] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const filtered = applyFilters(items, filters, {
    searchFields: ["description", "ref", "employeeName", "purpose"],
    statusField: "status",
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "ref",
      header: "المرجع",
      sortable: true,
      render: (c) => <span className="font-mono text-status-info-foreground text-sm">{c.ref}</span>,
    },
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (c) => <span className="font-medium">{c.employeeName || "-"}</span>,
    },
    {
      key: "description",
      header: "الوصف",
      sortable: true,
      render: (c) => (
        <div className="text-muted-foreground">
          {c.description || "-"}
          {c.purpose && <div className="text-xs text-muted-foreground mt-0.5">{c.purpose}</div>}
        </div>
      ),
    },
    {
      key: "amount",
      header: "المبلغ",
      sortable: true,
      render: (c) => <span className="font-semibold">{formatCurrency(c.amount)}</span>,
    },
    {
      key: "remainingAmount",
      header: "المتبقي",
      sortable: true,
      render: (c) => (
        <span className="font-semibold text-orange-600">
          {formatCurrency(c.remainingAmount || 0)}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (c) => (
        <div className="flex flex-col items-start gap-0.5">
          <PageStatusBadge status={c.status} domain="custody" />
          {c.daysOverdue > 0 && (
            <span className="text-xs text-status-error">{c.daysOverdue} يوم تأخير</span>
          )}
        </div>
      ),
    },
    {
      key: "expectedReturnDate",
      header: "تاريخ الإرجاع",
      sortable: true,
      render: (c) => (
        <span className="text-muted-foreground text-sm">
          {c.expectedReturnDate ? formatDateAr(c.expectedReturnDate) : "-"}
        </span>
      ),
    },
    {
      key: "date",
      header: "التاريخ",
      sortable: true,
      render: (c) => (
        <span className="text-muted-foreground text-sm">{c.date ? formatDateAr(c.date) : "-"}</span>
      ),
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (c) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Link href={`/finance/custodies/${c.id}`}>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="عرض">
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
          {c.status !== "settled" && c.status !== "pending" && c.status !== "rejected" && (
            <Button variant="outline" size="sm" onClick={() => setSettleTarget(c)}>
              تسوية
            </Button>
          )}
          <button
            onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
            className="text-muted-foreground hover:text-muted-foreground p-1"
            title="عرض إجراءات الاعتماد"
          >
            {expandedId === c.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="العهد"
      subtitle="إدارة عهد الموظفين والتسويات ومتابعة الأعمار والمتأخرات"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "العهد" }]}
      loading={isLoading}
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href="/finance/custodies/report">
              <BarChart3 className="h-4 w-4 me-1" />
              تقرير أعمار العهد
            </Link>
          </Button>
          <GuardedButton perm="finance:create" size="sm" onClick={() => setShowForm((s) => !s)}>
            {showForm ? (
              <>
                <X className="h-4 w-4 me-1" />
                إلغاء
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 me-1" />
                عهدة جديدة
              </>
            )}
          </GuardedButton>
        </div>
      }
    >
      <KpiGrid items={[
        { label: "عدد العهد", value: summary.total || 0, icon: KeyRound, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "المتبقي (قائمة)", value: formatCurrency(Number(summary.totalRemaining || 0)), icon: AlertCircle, color: "text-status-warning-foreground bg-status-warning-surface" },
        { label: "المسوّاة", value: items.filter((c: any) => c.status === "settled").length, icon: CheckCircle, color: "text-status-success-foreground bg-status-success-surface" },
        { label: "إجمالي المبالغ", value: formatCurrency(Number(summary.totalAmount || 0)), icon: DollarSign, color: "text-emerald-600 bg-emerald-50" },
      ]} />

      {showForm && <CreateCustodyForm onDone={() => setShowForm(false)} />}
      {settleTarget && (
        <SettleCustodyForm custody={settleTarget} onDone={() => setSettleTarget(null)} />
      )}

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو المرجع أو الغرض...",
          statuses: [
            { value: "active", label: "نشطة" },
            { value: "partial", label: "مسوّاة جزئياً" },
            { value: "settled", label: "مسوّاة" },
            { value: "pending", label: "بانتظار الموافقة" },
            { value: "overdue", label: "متأخرة" },
            { value: "rejected", label: "مرفوضة" },
            { value: "returned", label: "مُرجعة" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() =>
          exportToCSV(
            (filtered || []) as any[],
            [
              { key: "ref", label: "المرجع" },
              { key: "employeeName", label: "الموظف" },
              { key: "description", label: "الوصف" },
              { key: "purpose", label: "الغرض" },
              { key: "amount", label: "المبلغ" },
              { key: "settledAmount", label: "المسوّى" },
              { key: "remainingAmount", label: "المتبقي" },
              { key: "status", label: "الحالة" },
              { key: "date", label: "التاريخ" },
              { key: "expectedReturnDate", label: "تاريخ الإرجاع المتوقع" },
              { key: "daysOverdue", label: "أيام التأخير" },
            ],
            "العهد",
          )
        }
        resultCount={filtered?.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد عهد"
        emptyIcon={<KeyRound className="h-6 w-6 text-slate-400" />}
        rowClassName={(c) => (c.status === "overdue" ? "bg-status-error-surface" : undefined)}
        onRowClick={(c) => navigate(`/finance/custodies/${c.id}`)}
        noToolbar
        renderRowExtras={(c) => {
          if (expandedId !== c.id) return null;
          return (
            <div className="p-3 bg-surface-subtle/50">
              {(c.approvalStatus === "draft" ||
                c.approvalStatus === "returned" ||
                c.approvalStatus === "pending_approval") && (
                <div className="mb-4 bg-white p-4 rounded-lg border">
                  <h4 className="font-semibold mb-3">إجراءات الاعتماد</h4>
                  <ApprovalActions
                    entityType="custody"
                    entityId={c.id}
                    currentStatus={c.approvalStatus}
                    approveEndpoint={`/finance/custodies/${c.id}/approve`}
                    rejectEndpoint={`/finance/custodies/${c.id}/approve`}
                    returnEndpoint={`/finance/custodies/${c.id}/approve`}
                    approveMethod="PATCH"
                    rejectMethod="PATCH"
                    returnMethod="PATCH"
                    approveBody={(notes) => ({ approved: true, notes: notes || undefined })}
                    rejectBody={(notes) => ({ approved: false, notes })}
                    returnBody={(notes) => ({ approved: "returned", notes })}
                    pendingStatuses={["draft", "pending_approval", "returned"]}
                    onDone={() => setExpandedId(null)}
                    invalidateKeys={[["custodies"]]}
                  />
                </div>
              )}
              <ActionHistory entityType="custody" entityId={c.id} defaultOpen />
            </div>
          );
        }}
      />
    </PageShell>
  );
}

/**
 * Inline "new custody" form. Uses `useApiMutation` with its built-in
 * successMessage + invalidateKeys so typed errors (VALIDATION_ERROR
 * with `field`, CONFLICT, FORBIDDEN) flow through R.1.2's toast
 * pipeline automatically. The old version had its own try/catch that
 * swallowed the server's structured detail and showed a generic
 * "حدث خطأ" toast instead.
 */
const custodySchema = z.object({
  assignmentId: z.string().min(1, "الموظف مطلوب"),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون موجبًا"),
  description: z.string().trim(),
  sourceAccountCode: z.string(),
  purpose: z.string().trim(),
  expectedReturnDate: z.string(),
});
type CustodyForm = z.infer<typeof custodySchema>;

function CreateCustodyForm({ onDone }: { onDone: () => void }) {
  const createMut = useApiMutation<unknown, Record<string, unknown>>(
    "/finance/custodies",
    "POST",
    [["custodies"]],
    {
      successMessage: "تم إضافة العهدة",
      onSuccess: () => onDone(),
    },
  );
  const { data: accountsData } = useApiQuery<{ data: any[] }>(["accounts-list"], "/finance/accounts");
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const sourceAccounts = (accountsData?.data || []).filter(
    (a: any) => a.code?.startsWith("11") || a.code?.startsWith("12"),
  );
  const employees = employeesData?.data || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>عهدة جديدة</CardTitle>
      </CardHeader>
      <CardContent>
        <FormShell
          schema={custodySchema}
          defaultValues={{
            assignmentId: "",
            amount: 0,
            description: "",
            sourceAccountCode: "",
            purpose: "",
            expectedReturnDate: "",
          }}
          submitLabel="حفظ"
          secondaryActions={
            <Button type="button" variant="outline" onClick={onDone}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await createMut.mutateAsync({
              assignmentId: Number(values.assignmentId),
              amount: values.amount,
              description: values.description,
              sourceAccountCode: values.sourceAccountCode,
              purpose: values.purpose || undefined,
              expectedReturnDate: values.expectedReturnDate || undefined,
            });
          }}
        >
          <FormGrid cols={2}>
            <FormSelectField
              name="assignmentId"
              label="الموظف"
              required
              options={[
                { value: "", label: "اختر الموظف..." },
                ...employees.map((e: any) => ({
                  value: String(e.assignmentId || e.id),
                  label: e.name,
                })),
              ]}
            />
            <FormNumberField name="amount" label="المبلغ" required />
            <FormSelectField
              name="sourceAccountCode"
              label="مصدر الصرف"
              options={[
                { value: "", label: "الخزنة النقدية (1100)" },
                ...sourceAccounts.map((a: any) => ({
                  value: a.code,
                  label: `${a.code} - ${a.name}`,
                })),
              ]}
            />
            <FormTextField name="description" label="الوصف" />
            <FormTextField name="purpose" label="الغرض" placeholder="غرض العهدة (اختياري)" />
            <FormDateField name="expectedReturnDate" label="تاريخ الإرجاع المتوقع" />
          </FormGrid>
        </FormShell>
      </CardContent>
    </Card>
  );
}

/**
 * Inline settle form. Same story as CreateCustodyForm — the `toast` +
 * `queryClient` plumbing was redundant once `useApiMutation` was given
 * its successMessage + invalidateKeys. Client-side guards (amount
 * positive, not exceeding remaining) live here because they're pure
 * UX and the server enforces the same thing authoritatively.
 */
function settleSchema(remaining: number) {
  // The over-settlement guard used to live as a manual `if`
  // (`if (Number(amount) > Number(custody.remainingAmount))`) and a
  // local `clientError` string. Pushing it into zod means the submit
  // button can't fire until the value is valid — and the error
  // surfaces inline on the field, not at the bottom of the card.
  return z.object({
    amount: z.coerce
      .number({ invalid_type_error: "أدخل رقمًا صحيحًا" })
      .positive("المبلغ يجب أن يكون أكبر من صفر")
      .max(remaining, `مبلغ التسوية يتجاوز المتبقي (${remaining})`),
    description: z.string().trim(),
  });
}

function SettleCustodyForm({ custody, onDone }: { custody: any; onDone: () => void }) {
  const settleMut = useApiMutation<unknown, { custodyRef: string; amount: number; description: string }>(
    "/finance/custodies/settle",
    "POST",
    [["custodies"]],
    {
      successMessage: "تمت التسوية بنجاح",
      onSuccess: () => onDone(),
    },
  );
  const remaining = Number(custody.remainingAmount || 0);
  const schema = settleSchema(remaining);
  type SettleForm = z.infer<typeof schema>;

  return (
    <Card className="border-status-warning-surface">
      <CardHeader>
        <CardTitle className="text-base">تسوية عهدة: {custody.ref}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-surface-subtle p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">المبلغ الأصلي</p>
            <p className="text-lg font-bold">{formatCurrency(custody.amount)}</p>
          </div>
          <div className="bg-status-warning-surface p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">المتبقي</p>
            <p className="text-lg font-bold text-status-warning-foreground">
              {formatCurrency(custody.remainingAmount)}
            </p>
          </div>
          <div className="bg-emerald-50 p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">المسوّى سابقاً</p>
            <p className="text-lg font-bold text-emerald-700">
              {formatCurrency(custody.settledAmount || 0)}
            </p>
          </div>
        </div>
        <FormShell
          schema={schema}
          defaultValues={{ amount: remaining, description: "" } as SettleForm}
          submitLabel="تسوية"
          secondaryActions={
            <Button type="button" variant="outline" onClick={onDone}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await settleMut.mutateAsync({
              custodyRef: custody.ref,
              amount: values.amount,
              description: values.description,
            });
          }}
        >
          <FormGrid cols={2}>
            <FormNumberField name="amount" label="مبلغ التسوية" required />
            <FormTextField name="description" label="ملاحظات" placeholder="اختياري" />
          </FormGrid>
        </FormShell>
      </CardContent>
    </Card>
  );
}
