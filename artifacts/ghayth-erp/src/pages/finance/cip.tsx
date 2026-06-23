import { useState } from "react";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { Card, CardContent } from "@/components/ui/card";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Building2, CheckCircle2, HardHat, Plus, ChevronDown, Coins } from "lucide-react";
import { formatDateAr, formatCurrency, todayLocal } from "@/lib/formatters";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { useAppContext } from "@/contexts/app-context";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

/**
 * الأعمال الرأسمالية تحت التنفيذ (CIP — construction_in_progress).
 *
 * Surfaces the CIP engine (finance-algorithms.ts): capital projects accumulating
 * cost before being capitalised into a fixed asset. Full lifecycle —
 *   POST /finance/cip                 create a project
 *   POST /finance/cip/:id/costs       add a cost line (accumulates totalCost)
 *   POST /finance/cip/:id/capitalize  capitalise → fixed asset + JE
 * — over the GET /finance/cip list.
 */

const STATUS: Record<string, { label: string; cls: string }> = {
  in_progress: { label: "قيد التنفيذ", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  capitalized: { label: "مُرسمَل",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  on_hold:     { label: "معلّق",       cls: "bg-muted text-muted-foreground" },
  cancelled:   { label: "ملغى",        cls: "bg-muted text-muted-foreground" },
};

interface Cip {
  id: number;
  code?: string;
  name: string;
  category?: string;
  totalCost: number;
  costEntryCount: number;
  startDate?: string;
  expectedCompletionDate?: string;
  status: string;
}

const EMPTY_CREATE = {
  name: "", category: "", startDate: todayLocal(), expectedCompletionDate: "", description: "",
  targetUsefulLifeYears: "", targetDepreciationMethod: "straight_line",
};
const EMPTY_COST = { costDate: todayLocal(), description: "", amount: "", cashAccountCode: "" };

export default function CipPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";

  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["cip", scopeQueryString],
    `/finance/cip${scopeSuffix}`,
  );
  const items: Cip[] = (data?.data || []) as Cip[];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(items);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_CREATE });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [costFor, setCostFor] = useState<Cip | null>(null);
  const [costForm, setCostForm] = useState({ ...EMPTY_COST });

  const capMut = useApiMutation<void, { id: number; capitalizationDate: string }>(
    (body) => `/finance/cip/${body.id}/capitalize`,
    "POST",
    [["cip"]],
    { successMessage: "تمت رسملة المشروع وإنشاء الأصل الثابت" },
  );
  const createMut = useApiMutation<{ data: unknown }, Record<string, unknown>>(
    "/finance/cip",
    "POST",
    [["cip"]],
    { successMessage: "تم إنشاء المشروع الرأسمالي" },
  );
  const addCostMut = useApiMutation<{ data: unknown }, { cipId: number; costDate: string; description: string; amount: number; cashAccountCode?: string }>(
    (body) => `/finance/cip/${body.cipId}/costs`,
    "POST",
    [["cip"]],
    { successMessage: "تمت إضافة التكلفة" },
  );

  const submitCreate = () => {
    const b: Record<string, unknown> = { name: createForm.name.trim(), startDate: createForm.startDate };
    if (createForm.category.trim()) b.category = createForm.category.trim();
    if (createForm.expectedCompletionDate) b.expectedCompletionDate = createForm.expectedCompletionDate;
    if (createForm.description.trim()) b.description = createForm.description.trim();
    if (Number(createForm.targetUsefulLifeYears) > 0) b.targetUsefulLifeYears = Number(createForm.targetUsefulLifeYears);
    if (createForm.targetDepreciationMethod) b.targetDepreciationMethod = createForm.targetDepreciationMethod;
    createMut.mutate(b, { onSuccess: () => { setCreateOpen(false); setCreateForm({ ...EMPTY_CREATE }); } });
  };

  const submitCost = () => {
    if (!costFor) return;
    const b = {
      cipId: costFor.id,
      costDate: costForm.costDate,
      description: costForm.description.trim(),
      amount: Number(costForm.amount),
      ...(costForm.cashAccountCode.trim() ? { cashAccountCode: costForm.cashAccountCode.trim() } : {}),
    };
    addCostMut.mutate(b, { onSuccess: () => { setCostFor(null); setCostForm({ ...EMPTY_COST }); } });
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const inProgress = items.filter((r) => r.status === "in_progress").length;
  const capitalized = items.filter((r) => r.status === "capitalized").length;
  const accumulated = items
    .filter((r) => r.status === "in_progress")
    .reduce((s, r) => s + Number(r.totalCost ?? 0), 0);

  const columns: DataTableColumn<Cip>[] = [
    {
      key: "name",
      header: "المشروع",
      searchable: true,
      sortable: true,
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium">{r.name}</span>
          {r.code && <span className="text-xs text-muted-foreground tabular-nums">{r.code}</span>}
        </div>
      ),
    },
    {
      key: "category",
      header: "الفئة",
      render: (r) => <span className="text-sm text-muted-foreground">{r.category || "—"}</span>,
    },
    {
      key: "totalCost",
      header: "التكلفة المتراكمة",
      sortable: true,
      render: (r) => <span className="tabular-nums font-medium">{formatCurrency(Number(r.totalCost ?? 0))}</span>,
    },
    {
      key: "costEntryCount",
      header: "بنود التكلفة",
      render: (r) => <span className="tabular-nums">{r.costEntryCount ?? 0}</span>,
    },
    {
      key: "expectedCompletionDate",
      header: "الإنجاز المتوقع",
      sortable: true,
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.expectedCompletionDate ? formatDateAr(r.expectedCompletionDate) : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (r) => {
        const s = STATUS[r.status] || STATUS.on_hold;
        return <Badge variant="outline" className={s.cls}>{s.label}</Badge>;
      },
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {r.status === "in_progress" && (
            <GuardedButton
              perm="finance:create"
              variant="ghost"
              size="icon"
              title="إضافة تكلفة"
              onClick={() => { setCostFor(r); setCostForm({ ...EMPTY_COST }); }}
            >
              <Coins className="h-4 w-4 text-amber-600" />
            </GuardedButton>
          )}
          <GuardedButton
            perm="finance:approve"
            variant="outline"
            size="sm"
            title="رسملة المشروع إلى أصل ثابت"
            disabled={capMut.isPending || r.status !== "in_progress" || Number(r.totalCost ?? 0) <= 0}
            onClick={() => capMut.mutate({ id: r.id, capitalizationDate: todayLocal() })}
          >
            <CheckCircle2 className="h-4 w-4 me-1" />
            رسملة
          </GuardedButton>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="الأعمال الرأسمالية تحت التنفيذ"
      subtitle="مشاريع رأسمالية تُجمَّع تكاليفها قبل رسملتها إلى أصل ثابت — أضِف التكاليف وتابِع المتراكم وارسمِل المكتمل"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "الأعمال الرأسمالية" }]}
      loading={isLoading}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_finance_cip"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "الأعمال الرأسمالية تحت التنفيذ", total: printRows.length },
              items: printRows.map((r: any) => ({
                "المشروع": r.name || "—",
                "الرمز": r.code || "—",
                "الفئة": r.category || "—",
                "التكلفة المتراكمة": Number(r.totalCost ?? 0),
                "الإنجاز المتوقع": r.expectedCompletionDate || "—",
                "الحالة": STATUS[r.status as string]?.label ?? r.status,
              })),
            })}
          />
          <GuardedButton perm="finance:create" size="sm" onClick={() => { setCreateForm({ ...EMPTY_CREATE }); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 me-1" /> مشروع جديد
          </GuardedButton>
        </div>
      }
    >
      <FinanceTabsNav />
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-amber-50 border border-amber-100">
              <HardHat className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">قيد التنفيذ</p>
              <p className="text-xl font-bold text-amber-600">{inProgress}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-emerald-50 border border-emerald-100">
              <Building2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">مُرسمَلة</p>
              <p className="text-xl font-bold text-emerald-600">{capitalized}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">إجمالي الجداول</p>
            <p className="text-xl font-bold">{items.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">تكلفة متراكمة (قيد التنفيذ)</p>
            <p className="text-xl font-bold tabular-nums">{formatCurrency(accumulated)}</p>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={items}
        onSortedDataChange={setPrintRows}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد مشاريع رأسمالية تحت التنفيذ"
        emptyIcon={<HardHat className="h-10 w-10 mx-auto opacity-30" />}
        searchPlaceholder="بحث بالاسم أو الرمز..."
      />

      {/* Create CIP project */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>مشروع رأسمالي جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>اسم المشروع</Label>
              <Input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>الفئة (اختياري)</Label>
                <Input value={createForm.category} onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>تاريخ البداية</Label>
                <Input type="date" value={createForm.startDate} onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>الإنجاز المتوقع (اختياري)</Label>
                <Input type="date" value={createForm.expectedCompletionDate} onChange={(e) => setCreateForm({ ...createForm, expectedCompletionDate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>وصف (اختياري)</Label>
              <Textarea rows={2} value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} />
            </div>
            <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowAdvanced((s) => !s)}>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} /> الإهلاك المستهدف (متقدّم)
            </button>
            {showAdvanced && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">العمر الإنتاجي (سنوات)</Label>
                  <Input type="number" value={createForm.targetUsefulLifeYears} onChange={(e) => setCreateForm({ ...createForm, targetUsefulLifeYears: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">طريقة الإهلاك</Label>
                  <Select value={createForm.targetDepreciationMethod} onValueChange={(v) => setCreateForm({ ...createForm, targetDepreciationMethod: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="straight_line">القسط الثابت</SelectItem>
                      <SelectItem value="declining_balance">القسط المتناقص</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {createMut.isError && <p className="text-sm text-destructive">{getErrorMessage(createMut.error)}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
            <GuardedButton perm="finance:create" onClick={submitCreate} disabled={!createForm.name.trim() || !createForm.startDate || createMut.isPending}>
              {createMut.isPending ? "جاري الإنشاء..." : "إنشاء"}
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add cost line */}
      <Dialog open={!!costFor} onOpenChange={(o) => !o && setCostFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>إضافة تكلفة — {costFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>تاريخ التكلفة</Label>
                <Input type="date" value={costForm.costDate} onChange={(e) => setCostForm({ ...costForm, costDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>المبلغ</Label>
                <Input type="number" inputMode="decimal" value={costForm.amount} onChange={(e) => setCostForm({ ...costForm, amount: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>وصف التكلفة</Label>
              <Input value={costForm.description} onChange={(e) => setCostForm({ ...costForm, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>حساب النقد/الدائن (اختياري)</Label>
              <Input value={costForm.cashAccountCode} onChange={(e) => setCostForm({ ...costForm, cashAccountCode: e.target.value })} placeholder="رمز الحساب — يُفترض إن تُرك" />
            </div>
            {addCostMut.isError && <p className="text-sm text-destructive">{getErrorMessage(addCostMut.error)}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCostFor(null)}>إلغاء</Button>
            <GuardedButton perm="finance:create" onClick={submitCost} disabled={!costForm.description.trim() || !(Number(costForm.amount) > 0) || addCostMut.isPending}>
              {addCostMut.isPending ? "جاري الإضافة..." : "إضافة التكلفة"}
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
