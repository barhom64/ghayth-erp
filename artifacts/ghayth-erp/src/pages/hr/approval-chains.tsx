import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { GitBranch, CheckCircle, Clock, AlertTriangle, Plus, Trash2, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { PageShell } from "@workspace/ui-core";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { AdvancedFilters, useFilters, applyFilters } from "@workspace/ui-core";
import { APPROVAL_ROLES, APPROVAL_CHAIN_STATUS } from "@/lib/hr-type-maps";

const STATUS_OPTIONS = Object.entries(APPROVAL_CHAIN_STATUS).map(([value, { label }]) => ({ value, label }));

const CHAIN_TYPES: Record<string, string> = {
  leaves: "الإجازات",
  purchases: "المشتريات",
  expenses: "المصروفات",
  advances: "السلف",
  letters: "الخطابات الرسمية",
  loans: "القروض",
  overtime: "العمل الإضافي",
  exit: "إخلاء الطرف",
};

const STEP_ROLES = ["manager", "branch_manager", "hr", "hr_manager", "general_manager", "finance_manager", "owner"];

interface StepDraft {
  requiredRole: string;
  timeoutHours: number;
  autoApproveOnTimeout: boolean;
}

const emptyStep = (): StepDraft => ({ requiredRole: "branch_manager", timeoutHours: 48, autoApproveOnTimeout: false });

export default function ApprovalChainsPage() {
  const [filters, setFilters] = useFilters();
  const stagesQ = useApiQuery<any>(["approval-chains"], "/hr/approval-chains");
  const defsQ = useApiQuery<any>(["approval-chain-definitions"], "/hr/approval-chain-definitions");

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [chainType, setChainType] = useState("leaves");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep()]);
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(null);

  const resetForm = () => {
    setName(""); setChainType("leaves"); setMinAmount(""); setMaxAmount("");
    setSteps([emptyStep()]); setShowForm(false);
  };

  const createMut = useApiMutation<unknown, any>(
    "/hr/approval-chain-definitions",
    "POST",
    [["approval-chain-definitions"]],
    { successMessage: "تم إنشاء سلسلة الموافقة", onSuccess: resetForm },
  );

  if (stagesQ.isLoading || defsQ.isLoading) return <LoadingSpinner />;
  if (stagesQ.isError || defsQ.isError) return <ErrorState />;

  const items = stagesQ.data?.data || [];
  const definitions = defsQ.data?.data || [];

  const filtered = applyFilters(items, filters, {
    searchFields: ["employeeName", "leaveTypeName"],
    statusField: "status",
    dateField: "createdAt",
  });

  const kpis = [
    { label: "تعريفات السلاسل", value: definitions.length, icon: Settings2, color: "text-purple-600 bg-purple-50" },
    { label: "مراحل قيد الانتظار", value: items.filter((i: any) => i.status === "pending").length, icon: Clock, color: "text-status-warning-foreground bg-status-warning-surface" },
    { label: "مراحل مكتملة", value: items.filter((i: any) => i.status === "approved").length, icon: CheckCircle, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "تصعيد", value: items.filter((i: any) => i.status === "escalated").length, icon: AlertTriangle, color: "text-status-error-foreground bg-status-error-surface" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "requestId",
      header: "الطلب",
      sortable: true,
      render: (v) => (
        <div>
          <span className="font-mono text-xs font-semibold text-status-info-foreground bg-status-info-surface px-2 py-1 rounded">
            #{v.requestId}
          </span>
          <span className="block text-xs text-muted-foreground mt-1">
            {v.leaveTypeName} — {v.days} أيام
          </span>
        </div>
      ),
    },
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={v.employeeName} color="blue" />
          <span className="font-medium text-sm">{v.employeeName}</span>
        </div>
      ),
    },
    {
      key: "stage",
      header: "المرحلة",
      sortable: true,
      render: (v) => <Badge variant="outline" className="text-xs">المرحلة {v.stage}</Badge>,
    },
    {
      key: "requiredRole",
      header: "الدور المطلوب",
      sortable: true,
      render: (v) => <span className="text-sm text-muted-foreground">{APPROVAL_ROLES[v.requiredRole] || v.requiredRole}</span>,
    },
    {
      key: "decision",
      header: "القرار",
      render: (v) => <span className="text-sm text-muted-foreground">{v.decision || "-"}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => {
        const st = APPROVAL_CHAIN_STATUS[v.status] || APPROVAL_CHAIN_STATUS.pending;
        return <Badge variant="outline" className={cn("text-xs", st.color)}>{st.label}</Badge>;
      },
    },
  ];

  const canSubmit = name.trim().length > 0 && steps.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    createMut.mutate({
      name: name.trim(),
      chainType,
      minAmount: minAmount === "" ? undefined : Number(minAmount),
      maxAmount: maxAmount === "" ? undefined : Number(maxAmount),
      steps: steps.map((s) => ({
        requiredRole: s.requiredRole,
        timeoutHours: Number(s.timeoutHours) || 48,
        autoApproveOnTimeout: s.autoApproveOnTimeout,
      })),
    });
  };

  return (
    <PageShell
      title="سلاسل الموافقات"
      subtitle="إعداد تعريفات مسارات الاعتماد ومتابعة مراحل الموافقة الجارية"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <GuardedButton perm="hr:create" size="sm" onClick={() => (showForm ? resetForm() : setShowForm(true))}>
          <Plus className="h-4 w-4 me-1" />{showForm ? "إلغاء" : "تعريف سلسلة جديدة"}
        </GuardedButton>
      }
    >
      <KpiGrid items={kpis} />

      {showForm && (
        <Card className="border-status-info-surface bg-status-info-surface">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">تعريف سلسلة موافقة جديدة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <Label className="text-xs">اسم السلسلة</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: اعتماد إجازات الفروع" />
              </div>
              <div>
                <Label className="text-xs">النوع</Label>
                <Select value={chainType} onValueChange={setChainType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CHAIN_TYPES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">أدنى مبلغ</Label>
                  <Input type="number" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label className="text-xs">أعلى مبلغ</Label>
                  <Input type="number" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="—" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">مراحل الاعتماد</Label>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSteps((s) => [...s, emptyStep()])}>
                  <Plus className="h-3.5 w-3.5 me-1" />إضافة مرحلة
                </Button>
              </div>
              {steps.map((step, i) => (
                <div key={i} className="flex items-end gap-2 p-2 rounded border bg-card">
                  <span className="text-xs text-muted-foreground pb-2">#{i + 1}</span>
                  <div className="flex-1">
                    <Label className="text-[10px]">الدور المعتمد</Label>
                    <Select
                      value={step.requiredRole}
                      onValueChange={(v) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, requiredRole: v } : x)))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STEP_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>{APPROVAL_ROLES[r] || r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-28">
                    <Label className="text-[10px]">المهلة (ساعات)</Label>
                    <Input
                      type="number"
                      value={step.timeoutHours}
                      onChange={(e) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, timeoutHours: Number(e.target.value) } : x)))}
                    />
                  </div>
                  <label className="flex items-center gap-1 text-xs pb-2 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={step.autoApproveOnTimeout}
                      onChange={(e) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, autoApproveOnTimeout: e.target.checked } : x)))}
                    />
                    اعتماد تلقائي عند المهلة
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={steps.length <= 1}
                    onClick={() => setSteps((s) => s.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-status-error-foreground" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <GuardedButton perm="hr:create" size="sm" disabled={!canSubmit || createMut.isPending} onClick={submit}>
                حفظ السلسلة
              </GuardedButton>
              <Button type="button" size="sm" variant="ghost" onClick={resetForm}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chain definitions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            تعريفات سلاسل الموافقة ({definitions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {definitions.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">لا توجد تعريفات سلاسل — أنشئ سلسلة جديدة لبدء أتمتة الاعتماد.</p>
          )}
          {definitions.map((d: any) => {
            const dSteps = (Array.isArray(d.steps) ? d.steps : []).filter((s: any) => s && s.id);
            return (
              <div key={d.id} className="flex items-center justify-between gap-3 p-3 rounded border">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{d.name}</span>
                    <Badge variant="outline" className="text-[10px]">{CHAIN_TYPES[d.chainType] || d.chainType}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {dSteps.length} مرحلة
                    {(d.minAmount || d.maxAmount) ? ` — النطاق ${Number(d.minAmount || 0)} إلى ${Number(d.maxAmount || 0)}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {dSteps.map((s: any) => (
                      <Badge key={s.id} variant="secondary" className="text-[10px]">
                        {s.stepOrder}. {APPROVAL_ROLES[s.requiredRole] || s.requiredRole}
                      </Badge>
                    ))}
                  </div>
                </div>
                <GuardedButton
                  perm="hr:delete"
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleting({ id: d.id, name: d.name || "—" })}
                >
                  <Trash2 className="h-3.5 w-3.5 text-status-error-foreground" />
                </GuardedButton>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Live approval stages */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            مراحل الموافقة الجارية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالاسم أو نوع الإجازة...",
              statuses: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
              showDateRange: false,
            }}
            values={filters}
            onChange={setFilters}
            resultCount={filtered.length}
          />
          <DataTable
            columns={columns}
            data={filtered}
            noToolbar
            emptyMessage="لا توجد مراحل موافقة جارية"
            pageSize={20}
          />
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(v) => { if (!v) setDeleting(null); }}
        entity={{ type: "approval_chain", id: deleting?.id ?? 0, name: deleting?.name ?? "" }}
        deletePath={`/hr/approval-chain-definitions/${deleting?.id}`}
        invalidateKeys={[["approval-chain-definitions"]]}
        successMessage="تم حذف السلسلة"
        onDeleted={() => setDeleting(null)}
      />
    </PageShell>
  );
}
