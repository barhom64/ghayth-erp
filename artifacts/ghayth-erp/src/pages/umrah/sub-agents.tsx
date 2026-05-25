import { useMemo, useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
  PageStatusBadge,
  FormShell,
  FormGrid,
  FormTextField,
  FormEmailField,
  FormPhoneField,
  FormNumberField,
  FormSelectField,
} from "@workspace/ui-core";
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

const subAgentSchema = z.object({
  nuskCode: z.string().min(1, "رمز نُسك مطلوب"),
  name: z.string().min(1, "الاسم مطلوب"),
  agentId: z.string().min(1, "الوكيل الرئيسي مطلوب"),
  paymentTerms: z.enum(["prepaid", "postpaid", "partial"]),
  defaultPricePerMutamer: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  country: z.string().optional(),
});
type SubAgentForm = z.infer<typeof subAgentSchema>;

const SUB_EMPTY: SubAgentForm = {
  nuskCode: "", name: "", agentId: "", paymentTerms: "prepaid",
  defaultPricePerMutamer: "", phone: "", email: "", country: "",
};

const PAYMENT_TERMS_OPTIONS = [
  { value: "prepaid", label: "مقدم" },
  { value: "postpaid", label: "مؤجل" },
  { value: "partial", label: "جزئي" },
];

export default function UmrahSubAgents() {
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
  // editingId: null = closed, "new" = create, number = edit row
  const [editingId, setEditingId] = useState<null | "new" | number>(null);
  const [editingDefaults, setEditingDefaults] = useState<SubAgentForm>(SUB_EMPTY);
  const [linking, setLinking] = useState<SubAgent | null>(null);
  const [linkClientId, setLinkClientId] = useState<string>("");

  const closeEditor = () => setEditingId(null);

  const createMut = useApiMutation<any, Partial<SubAgent>>(
    "/umrah/sub-agents",
    "POST",
    [["umrah-sub-agents"]],
    { successMessage: "تم حفظ الوكيل الفرعي", onSuccess: closeEditor },
  );
  const updateMut = useApiMutation<any, Partial<SubAgent>>(
    (body) => `/umrah/sub-agents/${body.id}`,
    "PATCH",
    [["umrah-sub-agents"]],
    { successMessage: "تم تحديث الوكيل الفرعي", onSuccess: closeEditor },
  );

  const openCreate = () => {
    setEditingDefaults(SUB_EMPTY);
    setEditingId("new");
  };
  const openEdit = (sa: SubAgent) => {
    setEditingDefaults({
      nuskCode: sa.nuskCode,
      name: sa.name,
      agentId: sa.agentId ? String(sa.agentId) : "",
      paymentTerms: sa.paymentTerms,
      defaultPricePerMutamer: sa.defaultPricePerMutamer != null ? String(sa.defaultPricePerMutamer) : "",
      phone: sa.phone ?? "",
      email: sa.email ?? "",
      country: sa.country ?? "",
    });
    setEditingId(sa.id);
  };
  const handleSave = async (values: SubAgentForm) => {
    const payload: Partial<SubAgent> = {
      nuskCode: values.nuskCode,
      name: values.name,
      agentId: Number(values.agentId),
      paymentTerms: values.paymentTerms,
      defaultPricePerMutamer: values.defaultPricePerMutamer ? Number(values.defaultPricePerMutamer) : undefined,
      phone: values.phone || undefined,
      email: values.email || undefined,
      country: values.country || undefined,
    };
    if (typeof editingId === "number") await updateMut.mutateAsync({ ...payload, id: editingId });
    else await createMut.mutateAsync(payload);
  };

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
          <Badge className="bg-status-error-surface text-status-error-foreground border-status-error-surface" variant="outline">
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
            onClick={() => openEdit(s)}
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
          onClick={openCreate}
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
          <div className="w-11 h-11 rounded-xl bg-status-info-surface flex items-center justify-center">
            <Users className="w-5 h-5 text-status-info-foreground" />
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
          <div className="w-11 h-11 rounded-xl bg-status-error-surface flex items-center justify-center">
            <Link2 className="w-5 h-5 text-status-error-foreground" />
          </div>
          <div>
            <p className="text-2xl font-bold text-status-error-foreground">{formatNumber(unlinkedCount)}</p>
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
      <Dialog open={editingId !== null} onOpenChange={(o) => !o && closeEditor()}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{typeof editingId === "number" ? "تعديل وكيل فرعي" : "وكيل فرعي جديد"}</DialogTitle>
          </DialogHeader>
          <FormShell
            key={String(editingId ?? "closed")}
            schema={subAgentSchema}
            defaultValues={editingDefaults}
            submitLabel={
              createMut.isPending || updateMut.isPending ? "جاري الحفظ..." : "حفظ"
            }
            secondaryActions={
              <Button type="button" variant="outline" onClick={closeEditor}>إلغاء</Button>
            }
            onSubmit={handleSave}
          >
            <FormGrid cols={2}>
              <FormTextField name="nuskCode" label="رمز نُسك" required />
              <FormTextField name="name" label="الاسم" required />
              <FormSelectField
                name="agentId"
                label="الوكيل الرئيسي"
                required
                options={agents.map((a) => ({ value: String(a.id), label: a.name }))}
                placeholder="اختر الوكيل"
              />
              <FormSelectField name="paymentTerms" label="شروط الدفع" options={PAYMENT_TERMS_OPTIONS} />
              <FormNumberField name="defaultPricePerMutamer" label="السعر الافتراضي للمعتمر" />
              <FormPhoneField name="phone" label="الهاتف" />
              <FormEmailField name="email" label="البريد الإلكتروني" />
              <FormTextField name="country" label="الدولة" />
            </FormGrid>
          </FormShell>
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
