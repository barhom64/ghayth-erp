import { useMemo, useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { PageStateWrapper } from "@/components/shared/page-state";
import { GuardedButton } from "@/components/shared/permission-gate";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { SearchableSelect } from "@/components/shared/searchable-select";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { Plus, Link2, Users, Pencil } from "lucide-react";

type PaymentTerms = "prepaid" | "postpaid" | "partial";

interface SubAgent {
  id: number;
  nuskCode: string;
  name: string;
  agentId: number | null;
  agentName?: string;
  clientId: number | null;
  clientName?: string;
  paymentTerms: PaymentTerms;
  defaultPricePerMutamer?: number;
  phone?: string;
  email?: string;
  country?: string;
  isActive: boolean;
}

const PAYMENT_TERMS_LABEL: Record<PaymentTerms, string> = {
  prepaid: "مقدم",
  postpaid: "مؤجل",
  partial: "جزئي",
};

export default function UmrahSubAgents() {
  // TODO: endpoint not yet implemented — placeholder response
  const subAgentsQ = useApiQuery<{ data: SubAgent[] }>(["umrah-sub-agents"], "/umrah/sub-agents");
  const agentsQ = useApiQuery<{ data: any[] }>(["umrah-agents"], "/umrah/agents");
  // Reuses existing clients endpoint
  const clientsQ = useApiQuery<{ data: any[] }>(["clients"], "/clients");

  const subAgents = subAgentsQ.data?.data ?? [];
  const agents = agentsQ.data?.data ?? [];
  const clients = clientsQ.data?.data ?? [];

  const [tab, setTab] = useState<"all" | "linked" | "unlinked">("all");
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [editing, setEditing] = useState<Partial<SubAgent> | null>(null);
  const [linking, setLinking] = useState<SubAgent | null>(null);
  const [linkClientId, setLinkClientId] = useState<string>("");

  const createMut = useApiMutation<any, Partial<SubAgent>>(
    "/umrah/sub-agents",
    "POST",
    [["umrah-sub-agents"]],
    { successMessage: "تم حفظ الوكيل الفرعي", onSuccess: () => setEditing(null) },
  );
  const updateMut = useApiMutation<any, Partial<SubAgent>>(
    (body) => `/umrah/sub-agents/${body.id}`,
    "PATCH",
    [["umrah-sub-agents"]],
    { successMessage: "تم تحديث الوكيل الفرعي", onSuccess: () => setEditing(null) },
  );
  const saveMut = { isPending: createMut.isPending || updateMut.isPending, mutate: (body: Partial<SubAgent>) => body.id ? updateMut.mutate(body) : createMut.mutate(body) };

  const linkMut = useApiMutation<any, { id: number; clientId: number }>(
    (body) => `/umrah/sub-agents/${body.id}/link-client`,
    "POST",
    [["umrah-sub-agents"]],
    {
      successMessage: "تم ربط العميل",
      onSuccess: () => {
        setLinking(null);
        setLinkClientId("");
      },
    },
  );

  const filtered = useMemo(() => {
    return subAgents.filter((s) => {
      if (tab === "linked" && !s.clientId) return false;
      if (tab === "unlinked" && s.clientId) return false;
      if (agentFilter && String(s.agentId) !== agentFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          s.name?.toLowerCase().includes(q) ||
          s.nuskCode?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [subAgents, tab, search, agentFilter]);

  const linkedCount = subAgents.filter((s) => !!s.clientId).length;
  const unlinkedCount = subAgents.length - linkedCount;

  const columns: DataTableColumn<SubAgent>[] = [
    {
      key: "nuskCode",
      header: "رمز نُسك",
      className: "font-mono text-xs",
      ltr: true,
    },
    {
      key: "name",
      header: "الاسم",
      render: (s) => <span className="font-medium">{s.name}</span>,
    },
    {
      key: "agent",
      header: "الوكيل الرئيسي",
      render: (s) => s.agentName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "client",
      header: "العميل المرتبط",
      render: (s) =>
        s.clientId ? (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200" variant="outline">
            {s.clientName ?? `#${s.clientId}`}
          </Badge>
        ) : (
          <Badge className="bg-red-50 text-red-700 border-red-200" variant="outline">
            غير مربوط
          </Badge>
        ),
    },
    {
      key: "paymentTerms",
      header: "شروط الدفع",
      render: (s) => PAYMENT_TERMS_LABEL[s.paymentTerms] ?? s.paymentTerms,
    },
    {
      key: "defaultPricePerMutamer",
      header: "السعر الافتراضي",
      render: (s) =>
        s.defaultPricePerMutamer != null ? formatCurrency(Number(s.defaultPricePerMutamer)) : "—",
    },
    {
      key: "status",
      header: "الحالة",
      render: (s) => <PageStatusBadge status={s.isActive ? "active" : "inactive"} />,
    },
    {
      key: "__actions",
      header: "إجراءات",
      render: (s) => (
        <div className="flex gap-1">
          {!s.clientId && (
            <GuardedButton
              perm="umrah:write"
              size="sm"
              variant="outline"
              onClick={() => setLinking(s)}
            >
              <Link2 className="h-3.5 w-3.5 ms-1" />
              ربط بعميل
            </GuardedButton>
          )}
          <GuardedButton
            perm="umrah:write"
            size="sm"
            variant="ghost"
            onClick={() => setEditing(s)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </GuardedButton>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="الوكلاء الفرعيون"
      subtitle="إدارة الوكلاء الفرعيين وربطهم بعملاء النظام"
      breadcrumbs={[{ label: "العمرة" }, { label: "الوكلاء الفرعيون" }]}
      actions={
        <GuardedButton
          perm="umrah:write"
          onClick={() => setEditing({ paymentTerms: "prepaid", isActive: true })}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          وكيل فرعي جديد
        </GuardedButton>
      }
    >
      <UmrahTabsNav />

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold">{formatNumber(subAgents.length)}</p>
            <p className="text-xs text-muted-foreground">إجمالي الوكلاء الفرعيين</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Link2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-700">{formatNumber(linkedCount)}</p>
            <p className="text-xs text-muted-foreground">مربوطون بعملاء</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center">
            <Link2 className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-red-700">{formatNumber(unlinkedCount)}</p>
            <p className="text-xs text-muted-foreground">غير مربوطين</p>
          </div>
        </CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="all">الكل ({formatNumber(subAgents.length)})</TabsTrigger>
          <TabsTrigger value="linked">مربوطون ({formatNumber(linkedCount)})</TabsTrigger>
          <TabsTrigger value="unlinked">غير مربوطين ({formatNumber(unlinkedCount)})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <Label className="text-xs">بحث</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو رمز نُسك..."
          />
        </div>
        <div className="min-w-[220px]">
          <Label className="text-xs">الوكيل الرئيسي</Label>
          <Select value={agentFilter || "all"} onValueChange={(v) => setAgentFilter(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="كل الوكلاء" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الوكلاء</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <PageStateWrapper
        isLoading={subAgentsQ.isLoading}
        error={subAgentsQ.error}
        onRetry={() => subAgentsQ.refetch()}
      >
        <DataTable
          columns={columns}
          data={filtered}
          emptyMessage="لا يوجد وكلاء فرعيون مطابقون"
          pageSize={20}
          noToolbar
        />
      </PageStateWrapper>

      {/* Create / Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "تعديل وكيل فرعي" : "وكيل فرعي جديد"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>رمز نُسك *</Label>
                <Input value={editing.nuskCode ?? ""} onChange={(e) => setEditing({ ...editing, nuskCode: e.target.value })} />
              </div>
              <div><Label>الاسم *</Label>
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div><Label>الوكيل الرئيسي *</Label>
                <Select
                  value={editing.agentId ? String(editing.agentId) : ""}
                  onValueChange={(v) => setEditing({ ...editing, agentId: Number(v) })}
                >
                  <SelectTrigger><SelectValue placeholder="اختر الوكيل" /></SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>شروط الدفع</Label>
                <Select
                  value={editing.paymentTerms ?? "prepaid"}
                  onValueChange={(v) => setEditing({ ...editing, paymentTerms: v as PaymentTerms })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prepaid">مقدم</SelectItem>
                    <SelectItem value="postpaid">مؤجل</SelectItem>
                    <SelectItem value="partial">جزئي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>السعر الافتراضي للمعتمر</Label>
                <Input
                  type="number"
                  value={editing.defaultPricePerMutamer ?? ""}
                  onChange={(e) => setEditing({ ...editing, defaultPricePerMutamer: Number(e.target.value) })}
                />
              </div>
              <div><Label>الهاتف</Label>
                <Input dir="ltr" value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </div>
              <div><Label>البريد الإلكتروني</Label>
                <Input dir="ltr" value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </div>
              <div><Label>الدولة</Label>
                <Input value={editing.country ?? ""} onChange={(e) => setEditing({ ...editing, country: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
            <GuardedButton
              perm="umrah:write"
              disabled={saveMut.isPending || !editing?.nuskCode || !editing?.name || !editing?.agentId}
              onClick={() => editing && saveMut.mutate(editing)}
            >
              {saveMut.isPending ? "جاري الحفظ..." : "حفظ"}
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link-to-client dialog */}
      <Dialog open={!!linking} onOpenChange={(o) => !o && setLinking(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>ربط بعميل موجود</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              اختر العميل في النظام الذي تريد ربطه بالوكيل الفرعي:&nbsp;
              <span className="font-semibold">{linking?.name}</span>
            </p>
            <SearchableSelect
              options={clients.map((c: any) => ({
                value: String(c.id),
                label: c.name ?? c.companyName ?? `#${c.id}`,
                sublabel: c.phone,
              }))}
              value={linkClientId}
              onValueChange={setLinkClientId}
              placeholder="اختر عميلاً..."
              searchPlaceholder="ابحث في العملاء..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinking(null)}>إلغاء</Button>
            <GuardedButton
              perm="umrah:write"
              disabled={!linkClientId || linkMut.isPending}
              onClick={() => {
                if (!linking || !linkClientId) return;
                linkMut.mutate({ id: linking.id, clientId: Number(linkClientId) });
              }}
            >
              ربط
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
