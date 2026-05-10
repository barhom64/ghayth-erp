import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, AlertTriangle, AlertCircle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell } from "@/components/page-shell";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { formatCurrency } from "@/lib/formatters";

type Violation = {
  id: number;
  type: "overstay" | "absconded" | "other";
  referenceType: "group" | "passport" | "border";
  referenceNumber: string;
  mutamerId: number | null;
  mutamerName: string | null;
  groupId: number | null;
  nuskGroupNumber: string | null;
  subAgentId: number | null;
  subAgentName: string | null;
  description: string | null;
  penaltyAmount: string | number;
  status: "detected" | "open" | "invoiced" | "paid" | "disputed" | "closed";
  linkedInvoiceId: number | null;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  overstay: "تجاوز مدة",
  absconded: "متغيّب (تم التبليغ)",
  other: "أخرى",
};

export default function UmrahViolations() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const queryPath = `/umrah/violations${statusFilter ? `?status=${statusFilter}` : ""}`;
  const { data: resp, refetch, isLoading, isError } = useApiQuery<{ data: Violation[] }>(
    ["umrah-violations", statusFilter], queryPath
  );
  const items = resp?.data ?? [];

  const { data: subAgentsResp } = useApiQuery<{ data: any[] }>(["umrah-sub-agents-list"], "/umrah/sub-agents");
  const subAgents = subAgentsResp?.data ?? [];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ type: "other", referenceType: "passport" });
  const { toast } = useToast();

  const createMutation = useApiMutation<{ id: number }, any>(
    "/umrah/violations", "POST", [["umrah-violations"]],
    { successMessage: "تم تسجيل المخالفة" }
  );
  const updateMutation = useApiMutation<{ id: number }, { id: number; status?: string }>(
    (b) => `/umrah/violations/${b.id}`, "PATCH", [["umrah-violations"]],
    { successMessage: "تم تحديث المخالفة" }
  );

  const save = () => {
    if (!form.referenceNumber?.trim() || form.penaltyAmount == null) {
      toast({ variant: "destructive", title: "الحقول الإلزامية ناقصة" });
      return;
    }
    createMutation.mutate(form, {
      onSuccess: () => {
        setShowForm(false);
        setForm({ type: "other", referenceType: "passport" });
        refetch();
      },
    });
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const overstayCount = items.filter((v) => v.type === "overstay").length;
  const abscondedCount = items.filter((v) => v.type === "absconded").length;
  const openCount = items.filter((v) => ["detected", "open", "disputed"].includes(v.status)).length;
  const totalAmount = items.reduce((s, v) => s + Number(v.penaltyAmount ?? 0), 0);
  const kpiCards = [
    { label: "إجمالي المخالفات", value: items.length, icon: AlertTriangle, color: "text-orange-600 bg-orange-50" },
    { label: "متجاوزون", value: overstayCount, icon: AlertCircle, color: "text-amber-600 bg-amber-50" },
    { label: "متغيّبون", value: abscondedCount, icon: ShieldAlert, color: "text-red-600 bg-red-50" },
    { label: "إجمالي الغرامات", value: formatCurrency(totalAmount), icon: AlertTriangle, color: "text-purple-600 bg-purple-50" },
  ];

  const columns: DataTableColumn<Violation>[] = [
    { key: "type", header: "النوع", sortable: true,
      render: (v) => (
        <span className={cn(
          "px-2 py-0.5 text-xs rounded font-medium",
          v.type === "absconded" && "bg-red-100 text-red-800",
          v.type === "overstay" && "bg-orange-100 text-orange-800",
          v.type === "other" && "bg-slate-100 text-slate-800"
        )}>
          {TYPE_LABELS[v.type]}
        </span>
      ),
    },
    { key: "referenceNumber", header: "المرجع", searchable: true,
      render: (v) => <span className="font-mono text-xs">{v.referenceType}: {v.referenceNumber}</span> },
    { key: "mutamerName", header: "المعتمر", searchable: true,
      render: (v) => v.mutamerName ?? "—" },
    { key: "nuskGroupNumber", header: "المجموعة",
      render: (v) => v.nuskGroupNumber ?? "—" },
    { key: "subAgentName", header: "الوكيل الفرعي",
      render: (v) => v.subAgentName ?? "—" },
    { key: "penaltyAmount", header: "المبلغ", sortable: true,
      render: (v) => <span className="font-bold">{formatCurrency(Number(v.penaltyAmount))}</span> },
    { key: "status", header: "الحالة", sortable: true,
      render: (v) => <PageStatusBadge status={v.status} /> },
    { key: "actions", header: "إجراءات",
      render: (v) => (
        <select
          className="text-xs border rounded p-1"
          value={v.status}
          onChange={(e) => updateMutation.mutate({ id: v.id, status: e.target.value }, {
            onSuccess: () => refetch(),
          })}
        >
          <option value="detected">مكتشفة</option>
          <option value="open">مفتوحة</option>
          <option value="invoiced">مفوترة</option>
          <option value="paid">مدفوعة</option>
          <option value="disputed">متنازع عليها</option>
          <option value="closed">مغلقة</option>
        </select>
      ) },
  ];

  return (
    <PageShell
      title="المخالفات والغرامات"
      breadcrumbs={[{ label: "العمرة" }, { label: "المخالفات" }]}
    >
      <UmrahTabsNav />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          <Button onClick={() => setShowForm(!showForm)} className="gap-2">
            <Plus className="h-4 w-4" />تسجيل مخالفة
          </Button>
          <select
            className="border rounded-md p-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">— كل الحالات —</option>
            <option value="open">مفتوحة</option>
            <option value="detected">مكتشفة</option>
            <option value="invoiced">مفوترة</option>
            <option value="paid">مدفوعة</option>
            <option value="disputed">متنازع عليها</option>
            <option value="closed">مغلقة</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {kpiCards.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label>نوع المخالفة *</Label>
              <select className="w-full border rounded-md p-2"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="overstay">تجاوز مدة</option>
                <option value="absconded">متغيّب</option>
                <option value="other">أخرى</option>
              </select>
            </div>
            <div>
              <Label>نوع المرجع *</Label>
              <select className="w-full border rounded-md p-2"
                value={form.referenceType}
                onChange={(e) => setForm({ ...form, referenceType: e.target.value })}
              >
                <option value="passport">رقم الجواز</option>
                <option value="group">رقم المجموعة</option>
                <option value="border">رقم الحدود</option>
              </select>
            </div>
            <div>
              <Label>رقم المرجع *</Label>
              <Input value={form.referenceNumber ?? ""}
                onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })}
              />
            </div>
            <div>
              <Label>الوكيل الفرعي</Label>
              <select className="w-full border rounded-md p-2"
                value={form.subAgentId ?? ""}
                onChange={(e) => setForm({ ...form, subAgentId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">— لا يوجد —</option>
                {subAgents.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>مبلغ الغرامة *</Label>
              <Input type="number" step="0.01" value={form.penaltyAmount ?? ""}
                onChange={(e) => setForm({ ...form, penaltyAmount: Number(e.target.value) })}
              />
            </div>
            <div className="md:col-span-3">
              <Label>الوصف</Label>
              <Input value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="col-span-full flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
              <Button onClick={save} disabled={createMutation.isPending}>حفظ</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={items}
        emptyMessage="لا توجد مخالفات مسجّلة"
        emptyIcon={<AlertTriangle className="h-6 w-6 text-slate-400" />}
        pageSize={20}
        searchPlaceholder="بحث في المخالفات..."
      />
    </PageShell>
  );
}
