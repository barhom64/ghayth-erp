import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2, Link2, Unlink } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell } from "@/components/page-shell";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";

type SubAgent = {
  id: number;
  name: string;
  nuskCode: string | null;
  agentId: number | null;
  agentName: string | null;
  country: string | null;
  clientId: number | null;
  clientName: string | null;
  paymentTerms: "prepaid" | "postpaid" | "partial";
  isActive: boolean;
};

export default function UmrahSubAgents() {
  const { data: resp, refetch, isLoading, isError } = useApiQuery<{ data: SubAgent[] }>(
    ["umrah-sub-agents"], "/umrah/sub-agents"
  );
  const items: SubAgent[] = resp?.data ?? [];

  const { data: clientsResp } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients?limit=500");
  const { data: agentsResp } = useApiQuery<{ data: any[] }>(["umrah-agents-list"], "/umrah/agents");
  const clients = clientsResp?.data ?? [];
  const agents = agentsResp?.data ?? [];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<SubAgent>>({});
  const [linkingSubAgent, setLinkingSubAgent] = useState<SubAgent | null>(null);
  const [linkClientId, setLinkClientId] = useState<number | null>(null);
  const { toast } = useToast();

  const createMutation = useApiMutation<{ id: number }, Partial<SubAgent>>(
    "/umrah/sub-agents", "POST", [["umrah-sub-agents"]],
    { successMessage: "تم إضافة الوكيل الفرعي" }
  );
  const updateMutation = useApiMutation<{ id: number }, Partial<SubAgent> & { id: number }>(
    (b) => `/umrah/sub-agents/${b.id}`, "PATCH", [["umrah-sub-agents"]],
    { successMessage: "تم تحديث الوكيل الفرعي" }
  );

  const save = () => {
    if (!form.name?.trim()) {
      toast({ variant: "destructive", title: "اسم الوكيل الفرعي مطلوب" });
      return;
    }
    createMutation.mutate(form, {
      onSuccess: () => {
        setShowForm(false);
        setForm({});
        refetch();
      },
    });
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const linkedCount = items.filter((s) => s.clientId).length;
  const unlinkedCount = items.length - linkedCount;
  const kpiCards = [
    { label: "إجمالي الوكلاء الفرعيين", value: items.length, icon: Building2, color: "text-blue-600 bg-blue-50" },
    { label: "مربوط بعميل", value: linkedCount, icon: Link2, color: "text-green-600 bg-green-50" },
    { label: "غير مربوط (يحتاج ربط)", value: unlinkedCount, icon: Unlink, color: "text-orange-600 bg-orange-50" },
  ];

  const columns: DataTableColumn<SubAgent>[] = [
    { key: "name", header: "اسم الوكيل الفرعي", sortable: true, searchable: true,
      render: (s) => <span className="font-medium">{s.name}</span> },
    { key: "nuskCode", header: "كود نسك", searchable: true,
      render: (s) => s.nuskCode ?? "—" },
    { key: "agentName", header: "الوكيل الرئيسي", sortable: true, searchable: true,
      render: (s) => s.agentName ?? "—" },
    { key: "country", header: "الدولة", sortable: true,
      render: (s) => s.country ?? "—" },
    { key: "clientName", header: "العميل المرتبط", sortable: true, searchable: true,
      render: (s) => s.clientName
        ? <span className="text-green-600 font-medium">{s.clientName}</span>
        : <span className="text-orange-500 text-sm">غير مربوط</span> },
    { key: "paymentTerms", header: "شروط الدفع",
      render: (s) => <PageStatusBadge status={s.paymentTerms} /> },
    { key: "isActive", header: "الحالة",
      render: (s) => <PageStatusBadge status={s.isActive ? "active" : "inactive"} /> },
    { key: "actions", header: "إجراءات",
      render: (s) => (
        <div className="flex gap-2">
          {!s.clientId && (
            <Button
              size="sm" variant="outline"
              onClick={() => {
                setLinkingSubAgent(s);
                setLinkClientId(null);
              }}
            >
              <Link2 className="h-3.5 w-3.5 ml-1" />ربط بعميل
            </Button>
          )}
        </div>
      ) },
  ];

  return (
    <PageShell
      title="الوكلاء الفرعيون"
      breadcrumbs={[{ label: "العمرة" }, { label: "الوكلاء الفرعيون" }]}
    >
      <UmrahTabsNav />
      <div className="flex items-center justify-between">
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          <Plus className="h-4 w-4" />إضافة وكيل فرعي
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-3">
        {kpiCards.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
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
              <Label>اسم الوكيل الفرعي *</Label>
              <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>كود نسك</Label>
              <Input value={form.nuskCode ?? ""} onChange={(e) => setForm({ ...form, nuskCode: e.target.value })} />
            </div>
            <div>
              <Label>الوكيل الرئيسي</Label>
              <select
                className="w-full border rounded-md p-2"
                value={form.agentId ?? ""}
                onChange={(e) => setForm({ ...form, agentId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">— بدون وكيل رئيسي —</option>
                {agents.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.name}{a.country ? ` — ${a.country}` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>العميل المرتبط (مطلوب للفوترة)</Label>
              <select
                className="w-full border rounded-md p-2"
                value={form.clientId ?? ""}
                onChange={(e) => setForm({ ...form, clientId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">— اختر العميل —</option>
                {clients.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>شروط الدفع</Label>
              <select
                className="w-full border rounded-md p-2"
                value={form.paymentTerms ?? "postpaid"}
                onChange={(e) => setForm({ ...form, paymentTerms: e.target.value as any })}
              >
                <option value="prepaid">مقدّم</option>
                <option value="postpaid">آجل</option>
                <option value="partial">جزئي</option>
              </select>
            </div>
            <div className="col-span-full flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowForm(false); setForm({}); }}>إلغاء</Button>
              <Button onClick={save} disabled={!form.name || createMutation.isPending}>
                {createMutation.isPending ? "جاري الحفظ..." : "حفظ"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={items}
        emptyMessage="لا يوجد وكلاء فرعيون — سيُضافون تلقائياً عند استيراد ملف نسك"
        emptyIcon={<Building2 className="h-6 w-6 text-slate-400" />}
        pageSize={20}
        searchPlaceholder="بحث عن وكيل فرعي..."
      />

      <Dialog
        open={linkingSubAgent !== null}
        onOpenChange={(o) => { if (!o) { setLinkingSubAgent(null); setLinkClientId(null); } }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              ربط الوكيل الفرعي «{linkingSubAgent?.name}» بعميل
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              اختر العميل من القائمة. الفوترة على هذا الوكيل لن تعمل قبل الربط.
            </p>
            <div>
              <Label>العميل</Label>
              <select
                className="w-full border rounded-md p-2 mt-1"
                value={linkClientId ?? ""}
                onChange={(e) => setLinkClientId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— اختر —</option>
                {clients.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkingSubAgent(null)}>إلغاء</Button>
            <Button
              disabled={!linkClientId || updateMutation.isPending}
              onClick={() => {
                if (!linkingSubAgent || !linkClientId) return;
                updateMutation.mutate(
                  { id: linkingSubAgent.id, clientId: linkClientId },
                  {
                    onSuccess: () => {
                      setLinkingSubAgent(null);
                      setLinkClientId(null);
                      refetch();
                    },
                  }
                );
              }}
            >
              <Link2 className="h-4 w-4 ml-1" />تأكيد الربط
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
