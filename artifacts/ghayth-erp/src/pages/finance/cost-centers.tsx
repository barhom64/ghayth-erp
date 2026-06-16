import { useState } from "react";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { STATUSES } from "@/lib/constants";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { Layers, Plus, Building, Car, User, Briefcase, MapPin, Pencil, Trash2, Info } from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

interface CostCenter {
  id: number;
  code: string | null;
  name: string;
  type: string | null;
  parentId: number | null;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
  relatedEntityName: string | null;
  allocatedAmount: number | string | null;
  status: string;
  createdAt: string;
}

const ENTITY_TYPE_LABEL: Record<string, string> = {
  project:    "مشروع",
  vehicle:    "مركبة",
  employee:   "موظف",
  department: "إدارة",
  branch:     "فرع",
};

const ENTITY_TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  project:    Briefcase,
  vehicle:    Car,
  employee:   User,
  department: Layers,
  branch:     MapPin,
};

export default function CostCentersPage() {
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isError } = useApiQuery<{ data: CostCenter[] }>(
    ["cost-centers"],
    `/finance/cost-centers`,
  );

  // GET /finance/cost-centers/:id — full detail with children + recent
  // allocations. Fetched lazily when the operator clicks "تفاصيل" on a
  // row.
  const [detailId, setDetailId] = useState<number | null>(null);
  const detailQ = useApiQuery<any>(
    ["cost-center-detail", String(detailId ?? 0)],
    detailId ? `/finance/cost-centers/${detailId}` : null,
    { enabled: detailId !== null },
  );

  const [editing, setEditing] = useState<CostCenter | null>(null);
  const [deleting, setDeleting] = useState<CostCenter | null>(null);

  const createMut = useApiMutation("/finance/cost-centers", "POST", [["cost-centers"]]);
  // PATCH + DELETE for /finance/cost-centers/:id — backend already
  // supports both; the previous code-comment noted them as "follow-up
  // PR" but the UI never landed. Inline edit dialog + delete confirm
  // below.
  const updateMut = useApiMutation<unknown, { id: number; name: string; code: string | null; allocatedAmount: number | null; status: string }>(
    (b) => `/finance/cost-centers/${b.id}`,
    "PATCH",
    [["cost-centers"]],
    { successMessage: "تم تحديث مركز التكلفة", onSuccess: () => setEditing(null) },
  );
  const deleteMut = useApiMutation<unknown, { id: number }>(
    (b) => `/finance/cost-centers/${b.id}`,
    "DELETE",
    [["cost-centers"]],
    { successMessage: "تم حذف مركز التكلفة", onSuccess: () => setDeleting(null) },
  );

  const [form, setForm] = useState({
    code: "",
    name: "",
    type: "department",
    parentId: "",
    allocatedAmount: "",
  });

  const rows = data?.data ?? [];

  const filtered = typeFilter
    ? rows.filter((r) => (r.relatedEntityType ?? "general") === typeFilter)
    : rows;
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  if (isLoading) return <LoadingSpinner />;

  if (isError) return <ErrorState />;


  const linkedCount = rows.filter((r) => r.relatedEntityType).length;
  const totalAllocated = rows.reduce((s, r) => s + Number(r.allocatedAmount ?? 0), 0);
  const types = Array.from(new Set(rows.map((r) => r.relatedEntityType ?? "general"))).sort();

  const submitCreate = async () => {
    if (!form.name.trim()) {
      toast({ variant: "destructive", title: "اسم مركز التكلفة مطلوب" });
      return;
    }
    try {
      await createMut.mutateAsync({
        code: form.code || undefined,
        name: form.name,
        type: form.type,
        parentId: form.parentId ? Number(form.parentId) : null,
        allocatedAmount: form.allocatedAmount ? Number(form.allocatedAmount) : undefined,
      });
      toast({ title: "تم إنشاء مركز التكلفة" });
      setCreateOpen(false);
      setForm({ code: "", name: "", type: "department", parentId: "", allocatedAmount: "" });
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر الحفظ", description: getErrorMessage(err) });
    }
  };

  const cols: DataTableColumn<CostCenter>[] = [
    {
      key: "code",
      header: "الرمز",
      render: (r) => r.code
        ? <span className="font-mono text-xs">{r.code}</span>
        : <span className="text-muted-foreground italic text-xs">—</span>,
    },
    {
      key: "name",
      header: "الاسم",
      render: (r) => <span className="font-medium text-sm">{r.name}</span>,
    },
    {
      key: "type",
      header: "النوع",
      render: (r) => r.type
        ? <Badge variant="outline" className="text-[10px]">{r.type}</Badge>
        : <span className="text-muted-foreground italic">—</span>,
    },
    {
      key: "linkedEntity",
      header: "الكيان المرتبط",
      render: (r) => {
        if (!r.relatedEntityType) return <span className="text-muted-foreground italic text-xs">—</span>;
        const Icon = ENTITY_TYPE_ICON[r.relatedEntityType] ?? Building;
        return (
          <div className="inline-flex items-center gap-1.5">
            <Icon className="h-3 w-3 text-muted-foreground" />
            <Badge variant="outline" className="text-[10px]">
              {ENTITY_TYPE_LABEL[r.relatedEntityType] ?? r.relatedEntityType}
            </Badge>
            {r.relatedEntityName && (
              <span className="text-xs text-muted-foreground">{r.relatedEntityName}</span>
            )}
          </div>
        );
      },
    },
    {
      key: "allocatedAmount",
      header: "الميزانية المخصصة",
      render: (r) => {
        const v = Number(r.allocatedAmount ?? 0);
        return v === 0
          ? <span className="text-muted-foreground italic text-xs">—</span>
          : <span className="font-mono text-xs">{formatCurrency(v)}</span>;
      },
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) => r.status === "active"
        ? <Badge className="bg-emerald-100 text-emerald-800 text-xs">نشط</Badge>
        : <Badge variant="outline" className="text-xs">{STATUSES[r.status] ?? r.status}</Badge>,
    },
    {
      key: "__actions",
      header: "إجراءات",
      render: (r) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDetailId(r.id === detailId ? null : r.id)}
            title="تفاصيل"
          >
            <Info className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(r)}
            title="تعديل"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleting(r)}
            title="حذف"
            className="text-status-error-foreground"
            disabled={deleteMut.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="مراكز التكلفة"
      subtitle="مراكز التكلفة — تستخدم كأبعاد محاسبية لتحليل المصاريف والأرباح حسب المشروع / المركبة / الموظف / الإدارة"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/accounts", label: "الحسابات" },
        { label: "مراكز التكلفة" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_finance_cost_centers"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "مراكز التكلفة", total: printRows.length },
              items: printRows.map((c: any) => ({
                "الرمز": c.code || "—",
                "الاسم": c.name || "—",
                "النوع": c.type || "—",
                "المسؤول": c.managerName || "—",
                "الفرع": c.branchName || "—",
                "الحالة": c.isActive ? "نشط" : "غير نشط",
              })),
            })}
          />
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <GuardedButton perm="finance:create">
              <Plus className="h-4 w-4 me-1" /> مركز جديد
            </GuardedButton>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>مركز تكلفة جديد</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">الرمز</Label>
                  <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CC-001" />
                </div>
                <div>
                  <Label className="text-xs">النوع</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="department">إدارة</SelectItem>
                      <SelectItem value="project">مشروع</SelectItem>
                      <SelectItem value="vehicle">مركبة</SelectItem>
                      <SelectItem value="branch">فرع</SelectItem>
                      <SelectItem value="general">عام</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">الاسم *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: نقل قطاع البناء" />
              </div>
              <div>
                <Label className="text-xs">الميزانية المخصصة (اختياري)</Label>
                <Input type="number" value={form.allocatedAmount} onChange={(e) => setForm({ ...form, allocatedAmount: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
              <Button onClick={submitCreate} disabled={createMut.isPending}>
                {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Layers className="h-4 w-4" /> ما هي مراكز التكلفة؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            مراكز التكلفة هي الأبعاد المحاسبية اللي يربط بها كل بند في الـ JE (مع
            الحساب). تحليل الأرباح/الخسائر "حسب المشروع" أو "حسب المركبة" يعتمد على
            هذي الأبعاد. الـ allocation engine في
            <code className="bg-muted px-1 rounded mx-1">lib/accountingAllocation.ts</code>
            ينتج الـ costCenterId تلقائياً حسب استراتيجية القاعدة (from_vehicle /
            from_project / ...).
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي المراكز</p>
            <p className="text-lg font-bold font-mono">{formatNumber(rows.length)}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">نشط</p>
            <p className="text-lg font-bold font-mono text-emerald-700">
              {formatNumber(rows.filter((r) => r.status === "active").length)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-status-info-surface">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">مرتبط بكيان</p>
            <p className="text-lg font-bold font-mono text-status-info-foreground">{formatNumber(linkedCount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي الميزانية</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(totalAllocated)}</p>
          </CardContent>
        </Card>
      </div>

      {types.length > 1 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-muted-foreground">نوع الكيان:</span>
          <Badge variant={typeFilter === "" ? "default" : "outline"}
            className="cursor-pointer text-xs"
            onClick={() => setTypeFilter("")}>الكل ({rows.length})</Badge>
          {types.map((t) => {
            const count = rows.filter((r) => (r.relatedEntityType ?? "general") === t).length;
            return (
              <Badge key={t}
                variant={typeFilter === t ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => setTypeFilter(t)}>
                {ENTITY_TYPE_LABEL[t] ?? t} ({count})
              </Badge>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">مراكز التكلفة ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={filtered}
            onSortedDataChange={setPrintRows}
            pageSize={50}
            emptyMessage={
              typeFilter
                ? `لا توجد مراكز تكلفة بهذا النوع`
                : "لا توجد مراكز تكلفة — اضغط 'مركز جديد' للبدء"
            }
          />
        </CardContent>
      </Card>

      {detailId !== null && detailQ.data && (
        <Card className="mt-3 border-indigo-100 bg-indigo-50/30">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">تفاصيل مركز تكلفة #{detailId}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setDetailId(null)}>إغلاق</Button>
          </CardHeader>
          <CardContent className="text-xs grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(detailQ.data)
              .filter(([k, v]) => typeof v !== "object" || v === null)
              .slice(0, 12)
              .map(([k, v]) => (
                <div key={k} className="border bg-white rounded p-1">
                  <p className="text-muted-foreground text-[10px]">{k}</p>
                  <p className="font-mono">{v == null ? "—" : String(v)}</p>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Inline edit dialog — wires PATCH /finance/cost-centers/:id. */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل مركز التكلفة</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="edit-cc-code">الرمز</Label>
                <Input
                  id="edit-cc-code"
                  defaultValue={editing.code ?? ""}
                  onChange={(e) => { editing.code = e.target.value; }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-cc-name">الاسم</Label>
                <Input
                  id="edit-cc-name"
                  defaultValue={editing.name}
                  onChange={(e) => { editing.name = e.target.value; }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-cc-amount">المبلغ المخصص</Label>
                <Input
                  id="edit-cc-amount"
                  type="number"
                  defaultValue={editing.allocatedAmount?.toString() ?? ""}
                  onChange={(e) => { editing.allocatedAmount = e.target.value as any; }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-cc-status">الحالة</Label>
                <Select
                  defaultValue={editing.status}
                  onValueChange={(v) => { editing.status = v; }}
                >
                  <SelectTrigger id="edit-cc-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">نشط</SelectItem>
                    <SelectItem value="inactive">معطّل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
            <GuardedButton
              perm="finance:update"
              onClick={() => {
                if (!editing) return;
                updateMut.mutate({
                  id: editing.id,
                  name: editing.name,
                  code: editing.code,
                  allocatedAmount: editing.allocatedAmount != null && editing.allocatedAmount !== ""
                    ? Number(editing.allocatedAmount)
                    : null,
                  status: editing.status,
                });
              }}
              disabled={updateMut.isPending}
            >
              {updateMut.isPending ? "جاري الحفظ…" : "حفظ"}
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm — wires DELETE /finance/cost-centers/:id. */}
      <Dialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>حذف مركز التكلفة</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            هل تريد بالتأكيد حذف <span className="font-semibold text-status-neutral-foreground">{deleting?.name}</span>؟
            هذا الإجراء لا يمكن التراجع عنه.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>إلغاء</Button>
            <GuardedButton
              perm="finance:delete"
              variant="destructive"
              onClick={() => deleting && deleteMut.mutate({ id: deleting.id })}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "جاري الحذف…" : "حذف"}
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
