import { useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  FormShell,
  FormTextareaField,
  AdvancedFilters,
  useFilters,
  applyFilters,
} from "@workspace/ui-core";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PageStateWrapper } from "@/components/shared/page-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle,
  XCircle,
  ClipboardCheck,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useFormContext } from "react-hook-form";
import { formatDateAr } from "@/lib/formatters";

import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
/**
 * HR / Approval Inbox.
 *
 * Phase D / HR gap. Closes 2 unused-backend endpoints in a
 * single workflow page:
 *
 *   GET   /hr/approval-requests
 *     → Generic queue for every HR-domain approval that goes
 *       through the chain engine: leave / overtime / exit /
 *       transfer / official letter / salary advance / custody.
 *       Filter by status (pending / approved / rejected).
 *
 *   PATCH /hr/approval-requests/:id/decide
 *     → Approve/reject decision. Server enforces the chain's
 *       role + assigned-approver rules (owner override is OK,
 *       otherwise the actor must be the assigned approver OR
 *       hold the requiredRole). Auto-progresses the chain to
 *       the next step on approve, or fires rejection
 *       notification to the requester.
 *
 * Why this matters: every HR workflow that escalates
 * (manager → HR → director) writes to the approval_requests
 * table, but until now the assigned approver had to navigate
 * to each entity's own list and find their pending row.
 * The unified inbox lets a manager see every request waiting
 * on them in one place.
 *
 * Mirrors the budget-approvals page structure so muscle
 * memory carries between domains.
 */

interface ApprovalRequestRow {
  id: number;
  refType: string;
  refId: number;
  requiredRole: string | null;
  assignedTo: number | null;
  assignedToName: string | null;
  status: "pending" | "approved" | "rejected" | string;
  escalationLevel: number;
  currentStepOrder: number;
  chainId: number | null;
  expiresAt: string | null;
  createdAt: string;
  decidedAt?: string | null;
  decisionReason?: string | null;
}

const REF_TYPE_LABEL: Record<string, { label: string; href: (id: number) => string }> = {
  leave_request: { label: "طلب إجازة", href: (id) => `/hr/leaves/${id}` },
  purchase_order: { label: "أمر شراء", href: (id) => `/finance/purchase-orders/${id}` },
  expense: { label: "مصروف", href: (id) => `/finance/expenses/${id}` },
  salary_advance: { label: "سلفة راتب", href: (id) => `/finance/salary-advances/${id}` },
  custody: { label: "عهدة", href: (id) => `/finance/custodies/${id}` },
  official_letter: { label: "خطاب رسمي", href: (id) => `/hr/official-letters/${id}` },
  hr_transfer: { label: "نقل موظف", href: (id) => `/hr/transfers/${id}` },
  hr_exit: { label: "إنهاء خدمة", href: (id) => `/hr/exit/${id}` },
};

const ROLE_LABEL: Record<string, string> = {
  manager: "المدير المباشر",
  hr: "الموارد البشرية",
  finance: "المدير المالي",
  director: "المدير التنفيذي",
  owner: "المالك",
};

const decideSchema = z.object({
  approved: z.boolean(),
  reason: z.string().optional(),
});
type DecideForm = z.infer<typeof decideSchema>;

export default function HrApprovalsPage() {
  const [filters, setFilters] = useFilters({ status: "pending" });
  const [deciding, setDeciding] = useState<ApprovalRequestRow | null>(null);
  const { data, isLoading, error, refetch } = useApiQuery<{
    data: ApprovalRequestRow[];
    total: number;
  }>(
    ["hr-approval-requests", filters.status],
    `/hr/approval-requests${filters.status ? `?status=${filters.status}` : ""}`,
  );
  const rows = data?.data ?? [];
  const filtered = applyFilters(rows, filters, {
    searchFields: ["assignedToName", "refType"],
  });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  const columns: DataTableColumn<ApprovalRequestRow>[] = [
    {
      key: "refType",
      header: "نوع الطلب",
      render: (r) => {
        const meta = REF_TYPE_LABEL[r.refType];
        return (
          <div className="flex flex-col">
            <Badge variant="outline">{meta?.label ?? r.refType}</Badge>
            {meta && (
              <a
                href={meta.href(r.refId)}
                className="text-xs text-status-info-foreground hover:underline mt-0.5 font-mono"
                dir="ltr"
              >
                #{r.refId}
              </a>
            )}
          </div>
        );
      },
    },
    {
      key: "assignedToName",
      header: "المعتمد المعين",
      render: (r) =>
        r.assignedToName ? (
          <span className="font-medium">{r.assignedToName}</span>
        ) : r.requiredRole ? (
          <Badge variant="secondary">{ROLE_LABEL[r.requiredRole] ?? r.requiredRole}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "escalationLevel",
      header: "مستوى التصعيد",
      render: (r) => (
        <Badge variant={r.escalationLevel > 0 ? "destructive" : "outline"}>
          المستوى {r.escalationLevel}
        </Badge>
      ),
    },
    {
      key: "currentStepOrder",
      header: "خطوة السلسلة",
      render: (r) => <span className="font-mono text-xs">{r.currentStepOrder + 1}</span>,
    },
    {
      key: "expiresAt",
      header: "ينتهي في",
      render: (r) => {
        if (!r.expiresAt) return <span className="text-muted-foreground">—</span>;
        const exp = new Date(r.expiresAt);
        const overdue = exp.getTime() < Date.now();
        return (
          <span
            className={
              overdue ? "text-status-error-foreground font-semibold" : "text-muted-foreground"
            }
          >
            {formatDateAr(r.expiresAt)}
            {overdue && " (متأخر)"}
          </span>
        );
      },
    },
    {
      key: "createdAt",
      header: "التقديم",
      render: (r) => formatDateAr(r.createdAt),
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) => (
        <Badge
          variant={
            r.status === "approved"
              ? "default"
              : r.status === "rejected"
                ? "destructive"
                : "outline"
          }
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
            perm="hr.organization:update"
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

  const overdueCount = rows.filter(
    (r) => r.status === "pending" && r.expiresAt && new Date(r.expiresAt).getTime() < Date.now(),
  ).length;

  return (
    <PageShell
      title="صندوق الموافقات"
      subtitle="الطلبات المعلقة التي تنتظر قرارك أو دورك في سلسلة الاعتماد"
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { label: "صندوق الموافقات" },
      ]}
      actions={
        <PrintButton
          entityType="report_hr_approval_inbox"
          entityId={filters.status || "all"}
          size="icon"
          payload={() => ({
            entity: {
              title: `صندوق موافقات HR — ${filters.status || "الكل"}`,
              statusFilter: filters.status,
              total: printRows.length,
              overdue: overdueCount,
            },
            items: printRows.map((r: any) => ({
              "رقم الطلب": r.id,
              "نوع الطلب": r.entityType || "—",
              "الموظف": r.employeeName || r.requesterName || "—",
              "تاريخ الطلب": r.createdAt || "—",
              "الحالة": r.status || "—",
              "الخطوة الحالية": r.currentStep || r.approverName || "—",
            })),
          })}
        />
      }
    >
      <HrTabsNav />
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالمُسنَد إليه أو نوع الطلب...",
          statuses: [
            { value: "pending", label: "بانتظار البت" },
            { value: "approved", label: "مُعتمدة" },
            { value: "rejected", label: "مرفوضة" },
          ],
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />
      {filters.status === "pending" && overdueCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-status-error-foreground mb-3">
          <AlertCircle className="h-4 w-4" />
          {overdueCount} طلب متأخر عن موعد البت
        </div>
      )}

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        <DataTable
          columns={columns}
          onSortedDataChange={setPrintRows}
          data={filtered}
          rowKey={(r) => r.id}
          noToolbar
          emptyMessage={
            filters.status === "pending"
              ? "لا توجد طلبات تنتظر قرارك"
              : filters.status === "approved"
                ? "لا توجد طلبات معتمدة في السجل"
                : filters.status === "rejected"
                  ? "لا توجد طلبات مرفوضة في السجل"
                  : "لا توجد طلبات"
          }
        />
      </PageStateWrapper>

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
    </PageShell>
  );
}

function DecideDialog({
  request,
  onClose,
  onDecided,
}: {
  request: ApprovalRequestRow;
  onClose: () => void;
  onDecided: () => void;
}) {
  const mut = useApiMutation<unknown, DecideForm>(
    `/hr/approval-requests/${request.id}/decide`,
    "PATCH",
    [["hr-approval-requests"]],
    { successMessage: "تم تسجيل القرار" },
  );
  const meta = REF_TYPE_LABEL[request.refType];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            البت في طلب الموافقة #{request.id}
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-md bg-surface-subtle p-3 text-sm space-y-1 mb-3">
          <div className="flex justify-between">
            <span>نوع الطلب:</span>
            <span className="font-medium">{meta?.label ?? request.refType}</span>
          </div>
          <div className="flex justify-between">
            <span>المرجع:</span>
            {meta ? (
              <a
                href={meta.href(request.refId)}
                className="text-status-info-foreground hover:underline font-mono"
                dir="ltr"
              >
                #{request.refId} ↗
              </a>
            ) : (
              <span className="font-mono" dir="ltr">
                #{request.refId}
              </span>
            )}
          </div>
          <div className="flex justify-between">
            <span>الخطوة الحالية:</span>
            <span>{request.currentStepOrder + 1}</span>
          </div>
          {request.requiredRole && (
            <div className="flex justify-between">
              <span>الدور المطلوب:</span>
              <Badge variant="secondary">
                {ROLE_LABEL[request.requiredRole] ?? request.requiredRole}
              </Badge>
            </div>
          )}
        </div>
        <FormShell
          schema={decideSchema}
          defaultValues={{ approved: true, reason: "" }}
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
          <FormTextareaField name="reason" label="السبب / الملاحظات" rows={3} />
          <p className="text-xs text-muted-foreground">
            عند الموافقة ستنتقل السلسلة للخطوة التالية تلقائياً (إن وجدت)، أو يكتمل الطلب ويُخطر
            المُقدم. عند الرفض يكتمل الطلب فوراً ويتلقى المُقدم إشعاراً يحوي السبب.
          </p>
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

function DecisionButtons() {
  const { watch, setValue } = useFormContext<DecideForm>();
  const value = watch("approved");
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        type="button"
        variant={value === true ? "default" : "outline"}
        onClick={() => setValue("approved", true, { shouldDirty: true })}
        className="gap-1"
      >
        <CheckCircle className="h-4 w-4" />
        موافقة
      </Button>
      <Button
        type="button"
        variant={value === false ? "destructive" : "outline"}
        onClick={() => setValue("approved", false, { shouldDirty: true })}
        className="gap-1"
      >
        <XCircle className="h-4 w-4" />
        رفض
      </Button>
    </div>
  );
}
