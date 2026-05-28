import { useState } from "react";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import {
  useInlineActions,
  RowActions,
  InlineEditForm,
  InlineDeleteConfirm,
} from "@/components/inline-actions";
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
import { Layers, Plus, Building, Car, User, Briefcase, MapPin, Info } from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";

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
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data, isLoading, isError } = useApiQuery<{ data: CostCenter[] }>(
    ["cost-centers"],
    `/finance/cost-centers`,
  );

  // GET /finance/cost-centers/:id — fetched lazily when the user clicks
  // the info icon. Returns full details (children, related, allocations).
  const detailQ = useApiQuery<any>(
    ["cost-center-detail", String(detailId ?? 0)],
    detailId ? `/finance/cost-centers/${detailId}` : null,
    { enabled: detailId !== null },
  );

  const createMut = useApiMutation("/finance/cost-centers", "POST", [["cost-centers"]]);

  const ccActions = useInlineActions({
    endpoint: "/finance/cost-centers",
    queryKeys: [["cost-centers"]],
  });

  const ccEditFields = [
    { key: "code", label: "الرمز" },
    { key: "name", label: "الاسم" },
    { key: "type", label: "النوع" },
    { key: "allocatedAmount", label: "المخصص", type: "number" as const },
  ];

  const [form, setForm] = useState({
    code: "",
    name: "",
    type: "department",
    parentId: "",
    allocatedAmount: "",
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const rows = data?.data ?? [];

  const filtered = typeFilter
    ? rows.filter((r) => (r.relatedEntityType ?? "general") === typeFilter)
    : rows;

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
        : <Badge variant="outline" className="text-xs">{r.status}</Badge>,
    },
    {
      key: "_actions" as any,
      header: "",
      render: (r) => (
        <div className="inline-flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            title="تفاصيل"
            onClick={() => setDetailId(r.id)}
          >
            <Info className="h-3.5 w-3.5" />
          </Button>
          <RowActions
            onEdit={() => ccActions.startEdit(r.id, {
              code: r.code ?? "",
              name: r.name,
              type: r.type ?? "",
              allocatedAmount: r.allocatedAmount ? String(r.allocatedAmount) : "",
            })}
            onDelete={() => ccActions.startDelete(r.id)}
            deletePerm="finance:delete"
          />
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="مراكز التكلفة"
      subtitle="cost_centers — تستخدم كأبعاد محاسبية لتحليل المصاريف والأرباح حسب المشروع / المركبة / الموظف / الإدارة"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/accounts", label: "الحسابات" },
        { label: "مراكز التكلفة" },
      ]}
      actions={
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
            pageSize={50}
            emptyMessage={
              typeFilter
                ? `لا توجد مراكز تكلفة بهذا النوع`
                : "لا توجد مراكز تكلفة — اضغط 'مركز جديد' للبدء"
            }
          />
        </CardContent>
      </Card>

      {ccActions.editingId !== null && (
        <InlineEditForm
          fields={ccEditFields}
          initialValues={ccActions.editForm}
          onSave={(values) => ccActions.handleSave(ccActions.editingId!, values)}
          onCancel={ccActions.cancelEdit}
          isPending={ccActions.isPending}
        />
      )}

      {ccActions.deletingId !== null && (
        <InlineDeleteConfirm
          onConfirm={() => ccActions.handleDelete(ccActions.deletingId!)}
          onCancel={ccActions.cancelDelete}
          isPending={ccActions.isPending}
        />
      )}

      <Dialog open={detailId !== null} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تفاصيل مركز التكلفة #{detailId}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {detailQ.isLoading ? (
              <div className="text-center py-6 text-sm text-muted-foreground">جاري التحميل...</div>
            ) : detailQ.data ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">الاسم</p>
                  <p className="font-medium">{detailQ.data.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">الرمز</p>
                  <p className="font-mono">{detailQ.data.code ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">النوع</p>
                  <p>{detailQ.data.type ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">الحالة</p>
                  <p>{detailQ.data.status ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">الميزانية المخصصة</p>
                  <p className="font-mono">{formatCurrency(Number(detailQ.data.allocatedAmount ?? 0))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">المصروف الفعلي</p>
                  <p className="font-mono">{formatCurrency(Number(detailQ.data.actualAmount ?? detailQ.data.spent ?? 0))}</p>
                </div>
                {detailQ.data.relatedEntityName && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">الكيان المرتبط</p>
                    <p className="font-medium">
                      {ENTITY_TYPE_LABEL[detailQ.data.relatedEntityType ?? ""] ?? detailQ.data.relatedEntityType}
                      {" — "}
                      {detailQ.data.relatedEntityName}
                    </p>
                  </div>
                )}
                {Array.isArray(detailQ.data.children) && detailQ.data.children.length > 0 && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">المراكز الفرعية</p>
                    <ul className="text-xs space-y-0.5">
                      {detailQ.data.children.slice(0, 8).map((c: any) => (
                        <li key={c.id} className="flex items-center justify-between">
                          <span>{c.name}</span>
                          <span className="font-mono text-muted-foreground">{c.code ?? ""}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6 text-sm text-muted-foreground">لا توجد بيانات</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailId(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
