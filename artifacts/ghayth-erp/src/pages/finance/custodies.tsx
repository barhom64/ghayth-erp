import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
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
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
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
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const filtered = applyFilters(items, filters, {
    searchFields: ["description", "ref", "employeeName", "purpose"],
    statusField: "status",
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "ref",
      header: "المرجع",
      sortable: true,
      render: (c) => <span className="font-mono text-blue-600 text-sm">{c.ref}</span>,
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
        <div className="text-gray-600">
          {c.description || "-"}
          {c.purpose && <div className="text-xs text-gray-400 mt-0.5">{c.purpose}</div>}
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
            <span className="text-xs text-red-500">{c.daysOverdue} يوم تأخير</span>
          )}
        </div>
      ),
    },
    {
      key: "expectedReturnDate",
      header: "تاريخ الإرجاع",
      sortable: true,
      render: (c) => (
        <span className="text-gray-500 text-sm">
          {c.expectedReturnDate ? formatDateAr(c.expectedReturnDate) : "-"}
        </span>
      ),
    },
    {
      key: "date",
      header: "التاريخ",
      sortable: true,
      render: (c) => (
        <span className="text-gray-500 text-sm">{c.date ? formatDateAr(c.date) : "-"}</span>
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
            className="text-gray-400 hover:text-gray-600 p-1"
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
        { label: "عدد العهد", value: summary.total || 0, icon: KeyRound, color: "text-blue-600 bg-blue-50" },
        { label: "المتبقي (قائمة)", value: formatCurrency(Number(summary.totalRemaining || 0)), icon: AlertCircle, color: "text-amber-600 bg-amber-50" },
        { label: "المسوّاة", value: items.filter((c: any) => c.status === "settled").length, icon: CheckCircle, color: "text-green-600 bg-green-50" },
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
        rowClassName={(c) => (c.status === "overdue" ? "bg-red-50/30" : undefined)}
        onRowClick={(c) => navigate(`/finance/custodies/${c.id}`)}
        noToolbar
        renderRowExtras={(c) => {
          if (expandedId !== c.id) return null;
          return (
            <div className="p-3 bg-gray-50/50">
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
function CreateCustodyForm({ onDone }: { onDone: () => void }) {
  const createMut = useApiMutation<unknown, any>(
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
  const [form, setForm] = useState({
    assignmentId: "",
    amount: "",
    description: "",
    sourceAccountCode: "",
    purpose: "",
    expectedReturnDate: "",
  });

  const handleSubmit = () => {
    createMut.mutate({
      ...form,
      assignmentId: Number(form.assignmentId),
      amount: Number(form.amount),
      expectedReturnDate: form.expectedReturnDate || undefined,
      purpose: form.purpose || undefined,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>عهدة جديدة</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>الموظف</Label>
            <Select value={form.assignmentId} onValueChange={(v) => setForm({ ...form, assignmentId: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="اختر الموظف..." /></SelectTrigger>
              <SelectContent>
                {employees.map((e: any) => (
                  <SelectItem key={e.assignmentId || e.id} value={(e.assignmentId || e.id).toString()}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>المبلغ</Label>
            <Input
              className="mt-1"
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div>
            <Label>مصدر الصرف</Label>
            <Select value={form.sourceAccountCode || "_default"} onValueChange={(v) => setForm({ ...form, sourceAccountCode: v === "_default" ? "" : v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="الخزنة النقدية (1100)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_default">الخزنة النقدية (1100)</SelectItem>
                {sourceAccounts.map((a: any) => (
                  <SelectItem key={a.code || a.id} value={a.code}>
                    {a.code} - {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الوصف</Label>
            <Input
              className="mt-1"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <Label>الغرض</Label>
            <Input
              className="mt-1"
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              placeholder="غرض العهدة (اختياري)"
            />
          </div>
          <div>
            <Label>تاريخ الإرجاع المتوقع</Label>
            <div className="mt-1">
              <DatePicker
                value={form.expectedReturnDate}
                onChange={(v) => setForm({ ...form, expectedReturnDate: v })}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onDone}>
            إلغاء
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.assignmentId || !form.amount || createMut.isPending}
          >
            {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
          </Button>
        </div>
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
function SettleCustodyForm({ custody, onDone }: { custody: any; onDone: () => void }) {
  const settleMut = useApiMutation<unknown, any>(
    "/finance/custodies/settle",
    "POST",
    [["custodies"]],
    {
      successMessage: "تمت التسوية بنجاح",
      onSuccess: () => onDone(),
    },
  );
  const [amount, setAmount] = useState(String(custody.remainingAmount || 0));
  const [description, setDescription] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!amount || Number(amount) <= 0) {
      setClientError("المبلغ مطلوب ويجب أن يكون أكبر من صفر");
      return;
    }
    if (Number(amount) > Number(custody.remainingAmount)) {
      setClientError("مبلغ التسوية يتجاوز المتبقي");
      return;
    }
    setClientError(null);
    settleMut.mutate({
      custodyRef: custody.ref,
      amount: Number(amount),
      description,
    });
  };

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="text-base">تسوية عهدة: {custody.ref}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">المبلغ الأصلي</p>
            <p className="text-lg font-bold">{formatCurrency(custody.amount)}</p>
          </div>
          <div className="bg-amber-50 p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">المتبقي</p>
            <p className="text-lg font-bold text-amber-700">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>مبلغ التسوية</Label>
            <Input
              className="mt-1"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label>ملاحظات</Label>
            <Input
              className="mt-1"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اختياري"
            />
          </div>
        </div>
        {clientError && (
          <p className="text-xs text-red-600 mt-2">{clientError}</p>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onDone}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} disabled={!amount || settleMut.isPending}>
            {settleMut.isPending ? "جاري التسوية..." : "تسوية"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
