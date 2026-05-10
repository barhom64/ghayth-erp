import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Tag, Pencil, Trash2 } from "lucide-react";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell } from "@/components/page-shell";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { formatCurrency } from "@/lib/formatters";

type PricingRow = {
  id: number;
  agentId: number;
  agentName: string | null;
  subAgentId: number | null;
  subAgentName: string | null;
  seasonId: number;
  pricePerMutamer: string | number;
  includesHotel: boolean;
  includesTransport: boolean;
  validFrom: string;
  validTo: string | null;
  notes: string | null;
};

type PricingForm = {
  id?: number;
  agentId?: number | null;
  subAgentId?: number | null;
  seasonId?: number;
  pricePerMutamer?: number;
  includesHotel?: boolean;
  includesTransport?: boolean;
  validFrom?: string;
  validTo?: string | null;
  notes?: string;
};

export default function UmrahPricing() {
  const { data: resp, refetch, isLoading, isError } = useApiQuery<{ data: PricingRow[] }>(
    ["umrah-pricing"], "/umrah/pricing"
  );
  const items = resp?.data ?? [];

  const { data: agentsResp } = useApiQuery<{ data: any[] }>(["umrah-agents-list"], "/umrah/agents");
  const { data: subAgentsResp } = useApiQuery<{ data: any[] }>(["umrah-sub-agents-list"], "/umrah/sub-agents");
  const { data: seasonsResp } = useApiQuery<{ data: any[] }>(["umrah-seasons-list"], "/umrah/seasons");
  const agents = agentsResp?.data ?? [];
  const subAgents = subAgentsResp?.data ?? [];
  const seasons = seasonsResp?.data ?? [];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PricingForm>({});
  const { toast } = useToast();

  const createMutation = useApiMutation<{ id: number }, PricingForm>(
    "/umrah/pricing", "POST", [["umrah-pricing"]],
    { successMessage: "تم إضافة السعر" }
  );
  const updateMutation = useApiMutation<{ id: number }, PricingForm & { id: number }>(
    (b) => `/umrah/pricing/${b.id}`, "PATCH", [["umrah-pricing"]],
    { successMessage: "تم تحديث السعر" }
  );
  const deleteMutation = useApiMutation<{ ok: boolean }, { id: number }>(
    (b) => `/umrah/pricing/${b.id}`, "DELETE", [["umrah-pricing"]],
    { successMessage: "تم حذف السعر" }
  );

  const save = () => {
    if (!form.agentId || !form.seasonId || !form.validFrom || form.pricePerMutamer == null) {
      toast({ variant: "destructive", title: "الحقول الإلزامية ناقصة" });
      return;
    }
    const onDone = () => { setShowForm(false); setForm({}); refetch(); };
    if (form.id) {
      updateMutation.mutate({ ...form, id: form.id }, { onSuccess: onDone });
    } else {
      createMutation.mutate(form, { onSuccess: onDone });
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const columns: DataTableColumn<PricingRow>[] = [
    { key: "agentName", header: "الوكيل الرئيسي", sortable: true, searchable: true,
      render: (p) => p.agentName ?? "—" },
    { key: "subAgentName", header: "الوكيل الفرعي", searchable: true,
      render: (p) => p.subAgentName ?? <span className="text-muted-foreground">— افتراضي —</span> },
    { key: "pricePerMutamer", header: "سعر المعتمر", sortable: true,
      render: (p) => <span className="font-bold text-primary">{formatCurrency(Number(p.pricePerMutamer))}</span> },
    { key: "validFrom", header: "من تاريخ", sortable: true },
    { key: "validTo", header: "إلى تاريخ", sortable: true,
      render: (p) => p.validTo ?? <span className="text-muted-foreground">مفتوح</span> },
    { key: "includes", header: "شامل",
      render: (p) => (
        <div className="flex gap-1">
          {p.includesHotel && <span className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-700">فندق</span>}
          {p.includesTransport && <span className="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700">نقل</span>}
          {!p.includesHotel && !p.includesTransport && <span className="text-muted-foreground text-xs">—</span>}
        </div>
      ) },
    { key: "actions", header: "إجراءات",
      render: (p) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => {
            setForm({
              id: p.id, agentId: p.agentId, subAgentId: p.subAgentId, seasonId: p.seasonId,
              pricePerMutamer: Number(p.pricePerMutamer),
              includesHotel: p.includesHotel, includesTransport: p.includesTransport,
              validFrom: p.validFrom, validTo: p.validTo, notes: p.notes ?? "",
            });
            setShowForm(true);
          }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => {
            if (!confirm(`حذف سعر ${p.agentName ?? p.id}؟`)) return;
            deleteMutation.mutate({ id: p.id }, { onSuccess: () => refetch() });
          }}>
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
          </Button>
        </div>
      ) },
  ];

  return (
    <PageShell
      title="جدول الأسعار"
      breadcrumbs={[{ label: "العمرة" }, { label: "الأسعار" }]}
    >
      <UmrahTabsNav />
      <div className="flex items-center justify-between">
        <Button onClick={() => { setForm({}); setShowForm(!showForm); }} className="gap-2">
          <Plus className="h-4 w-4" />إضافة سعر
        </Button>
        <p className="text-sm text-muted-foreground">
          الأسعار تتبع الفترات الزمنية. عند إصدار فاتورة المبيعات النظام يبحث عن السعر الساري في تاريخ دخول المجموعة.
        </p>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label>الموسم *</Label>
              <select className="w-full border rounded-md p-2"
                value={form.seasonId ?? ""}
                onChange={(e) => setForm({ ...form, seasonId: Number(e.target.value) })}
              >
                <option value="">— اختر الموسم —</option>
                {seasons.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>الوكيل الرئيسي *</Label>
              <select className="w-full border rounded-md p-2"
                value={form.agentId ?? ""}
                onChange={(e) => setForm({ ...form, agentId: Number(e.target.value) })}
              >
                <option value="">— اختر الوكيل —</option>
                {agents.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.name}{a.country ? ` — ${a.country}` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>الوكيل الفرعي (اختياري)</Label>
              <select className="w-full border rounded-md p-2"
                value={form.subAgentId ?? ""}
                onChange={(e) => setForm({ ...form, subAgentId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">— سعر افتراضي —</option>
                {subAgents.filter((s: any) => !form.agentId || s.agentId === form.agentId).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>سعر المعتمر (ريال) *</Label>
              <Input type="number" step="0.01" value={form.pricePerMutamer ?? ""}
                onChange={(e) => setForm({ ...form, pricePerMutamer: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>من تاريخ *</Label>
              <Input type="date" value={form.validFrom ?? ""}
                onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
              />
            </div>
            <div>
              <Label>إلى تاريخ (اختياري)</Label>
              <Input type="date" value={form.validTo ?? ""}
                onChange={(e) => setForm({ ...form, validTo: e.target.value || null })}
              />
            </div>
            <div className="flex items-center gap-2 mt-6">
              <Checkbox checked={!!form.includesHotel}
                onCheckedChange={(v) => setForm({ ...form, includesHotel: !!v })}
              />
              <Label>يشمل الفندق</Label>
            </div>
            <div className="flex items-center gap-2 mt-6">
              <Checkbox checked={!!form.includesTransport}
                onCheckedChange={(v) => setForm({ ...form, includesTransport: !!v })}
              />
              <Label>يشمل النقل</Label>
            </div>
            <div className="md:col-span-3">
              <Label>ملاحظات</Label>
              <Input value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="col-span-full flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowForm(false); setForm({}); }}>إلغاء</Button>
              <Button onClick={save} disabled={createMutation.isPending || updateMutation.isPending}>
                {form.id ? "تحديث" : "حفظ"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={items}
        emptyMessage="لم تُضف أسعار بعد"
        emptyIcon={<Tag className="h-6 w-6 text-slate-400" />}
        pageSize={20}
        searchPlaceholder="بحث في الأسعار..."
      />
    </PageShell>
  );
}
