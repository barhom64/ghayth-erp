import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useApiQuery, useApiMutation, apiFetch, asList } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  FormShell,
  FormGrid,
  FormTextField,
  FormNumberField,
  FormSelectField,
  FormDateField,
} from "@workspace/ui-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Receipt, DollarSign, FileText, Plus, X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

/**
 * UMR-005 + UMR-016 — unified umrah invoices page with three tabs:
 *  - Agent invoices  (existing — sources /umrah/agent-invoices)
 *  - Sales invoices  (UMR-016 — sources GET /umrah/invoices)
 *  - Nusk invoices   (UMR-005 — full CRUD on /umrah/nusk-invoices)
 *
 * Each invoice type lives on a different backend table; the unified UI is
 * purely a navigation grouping so an operator finds all three under
 * /umrah/invoices.
 */
export default function UmrahInvoices() {
  const [tab, setTab] = useState("agents");
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">فواتير العمرة</h1>
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="agents" className="gap-2"><Receipt className="h-4 w-4" /> فواتير الوكلاء</TabsTrigger>
          <TabsTrigger value="sales" className="gap-2"><FileText className="h-4 w-4" /> فواتير المبيعات</TabsTrigger>
          <TabsTrigger value="nusk" className="gap-2"><DollarSign className="h-4 w-4" /> فواتير نسك</TabsTrigger>
        </TabsList>
        <TabsContent value="agents" className="mt-6"><AgentInvoicesTab /></TabsContent>
        <TabsContent value="sales" className="mt-6"><SalesInvoicesTab /></TabsContent>
        <TabsContent value="nusk" className="mt-6"><NuskInvoicesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Tab 1: Agent invoices (preserves prior behaviour) ──────────────────────
function AgentInvoicesTab() {
  const [, navigate] = useLocation();
  const { data: resp, refetch, isLoading, isError, error } = useApiQuery<any>(["umrah-agent-invoices"], "/umrah/agent-invoices");
  const { data: agents } = useApiQuery<any>(["umrah-agents"], "/umrah/agents");
  const { data: seasons } = useApiQuery<any>(["umrah-seasons"], "/umrah/seasons");
  const items = resp?.data || [];
  const [filters, setFilters] = useFilters();
  const [genAgent, setGenAgent] = useState("");
  const [genSeason, setGenSeason] = useState("");
  const { toast } = useToast();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const generate = async () => {
    try {
      await apiFetch("/umrah/agent-invoices/generate", { method: "POST", body: JSON.stringify({ agentId: Number(genAgent), seasonId: Number(genSeason) }) });
      toast({ title: "تم إنشاء الفاتورة" });
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message || "تعذر إنشاء الفاتورة", description: err?.fix });
    }
  };

  const filteredItems = items.filter((inv: any) => {
    if (filters.status && inv.status !== filters.status) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      return inv.ref?.toLowerCase().includes(q) || inv.agentName?.toLowerCase().includes(q) || inv.seasonTitle?.toLowerCase().includes(q);
    }
    return true;
  });

  const totalAmount = items.reduce((sum: number, inv: any) => sum + Number(inv.total || 0), 0);
  const paidAmount = items.filter((inv: any) => inv.status === "paid").reduce((sum: number, inv: any) => sum + Number(inv.total || 0), 0);

  const kpiCards = [
    { label: "إجمالي الفواتير", value: items.length, icon: FileText, color: "text-blue-600 bg-blue-50" },
    { label: "الإجمالي (ريال)", value: formatCurrency(totalAmount), icon: DollarSign, color: "text-purple-600 bg-purple-50" },
    { label: "المدفوع (ريال)", value: formatCurrency(paidAmount), icon: Receipt, color: "text-green-600 bg-green-50" },
  ];

  return (
    <div className="space-y-6">
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

      <Card>
        <CardContent className="p-4 flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <Label>الوكيل</Label>
            <Select value={genAgent} onValueChange={setGenAgent}>
              <SelectTrigger><SelectValue placeholder="اختر الوكيل" /></SelectTrigger>
              <SelectContent>
                {(agents?.data || []).map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <Label>الموسم</Label>
            <Select value={genSeason} onValueChange={setGenSeason}>
              <SelectTrigger><SelectValue placeholder="اختر الموسم" /></SelectTrigger>
              <SelectContent>
                {(seasons?.data || []).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <GuardedButton perm="umrah:create" onClick={generate} disabled={!genAgent || !genSeason} className="gap-2">
            <Receipt className="h-4 w-4" />إنشاء فاتورة
          </GuardedButton>
        </CardContent>
      </Card>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالمرجع أو الوكيل أو الموسم...",
          statuses: [
            { value: "draft", label: "مسودة" },
            { value: "sent", label: "مرسلة" },
            { value: "paid", label: "مدفوعة" },
            { value: "cancelled", label: "ملغية" },
          ],
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filteredItems.length}
      />

      <DataTable
        columns={[
          { key: "ref", header: "المرجع", render: (inv) => <span className="font-mono text-sm">{inv.ref}</span> },
          { key: "agentName", header: "الوكيل" },
          { key: "seasonTitle", header: "الموسم" },
          { key: "pilgrimCount", header: "عدد المعتمرين" },
          { key: "servicesTotal", header: "الخدمات (ريال)", render: (inv) => formatCurrency(Number(inv.servicesTotal)) },
          { key: "penaltiesTotal", header: "الغرامات (ريال)", render: (inv) => <span className="text-red-600">{formatCurrency(Number(inv.penaltiesTotal))}</span> },
          { key: "total", header: "الإجمالي (ريال)", render: (inv) => <span className="font-bold">{formatCurrency(Number(inv.total))}</span> },
          { key: "status", header: "الحالة", render: (inv) => <PageStatusBadge status={inv.status} /> },
        ] as DataTableColumn<any>[]}
        data={filteredItems}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا يوجد فواتير وكلاء"
        emptyIcon={<Receipt className="h-6 w-6 text-slate-400" />}
        noToolbar
        onRowClick={(row) => navigate(`/umrah/invoices/${row.id}`)}
      />
    </div>
  );
}

// ─── Tab 2: Sales invoices (UMR-016 — GET /umrah/invoices) ──────────────────
function SalesInvoicesTab() {
  const [seasonId, setSeasonId] = useState("");
  const [subAgentId, setSubAgentId] = useState("");
  const [status, setStatus] = useState("");

  const query = new URLSearchParams();
  if (seasonId) query.set("seasonId", seasonId);
  if (subAgentId) query.set("subAgentId", subAgentId);
  if (status) query.set("status", status);
  const url = `/umrah/invoices${query.toString() ? `?${query.toString()}` : ""}`;

  const { data, isLoading, isError, refetch, error } = useApiQuery<any>(
    ["umrah-sales-invoices", seasonId, subAgentId, status],
    url,
  );
  const { data: seasons } = useApiQuery<any>(["umrah-seasons"], "/umrah/seasons");
  const { data: subAgents } = useApiQuery<any>(["umrah-sub-agents"], "/umrah/sub-agents");
  const items = asList(data?.data || data);

  const columns: DataTableColumn<any>[] = [
    { key: "invoiceNumber", header: "رقم الفاتورة", render: (r) => <span className="font-mono text-sm">{r.invoiceNumber || r.ref || `#${r.id}`}</span> },
    { key: "clientName", header: "العميل", render: (r) => r.clientName || "—" },
    { key: "subAgentName", header: "الوكيل الفرعي", render: (r) => r.subAgentName || "—" },
    { key: "total", header: "الإجمالي (ريال)", render: (r) => <span className="font-bold">{formatCurrency(Number(r.total || r.totalAmount || 0))}</span> },
    { key: "status", header: "الحالة", render: (r) => <PageStatusBadge status={r.status} /> },
    { key: "createdAt", header: "تاريخ الإنشاء", render: (r) => (r.createdAt ? formatDateAr(r.createdAt) : "—") },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[160px]">
            <Label>الموسم</Label>
            <Select value={seasonId || "all"} onValueChange={(v) => setSeasonId(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="كل المواسم" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المواسم</SelectItem>
                {asList(seasons?.data).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <Label>الوكيل الفرعي</Label>
            <Select value={subAgentId || "all"} onValueChange={(v) => setSubAgentId(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="كل الوكلاء" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الوكلاء</SelectItem>
                {asList(subAgents?.data).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <Label>الحالة</Label>
            <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="كل الحالات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="draft">مسودة</SelectItem>
                <SelectItem value="issued">صادرة</SelectItem>
                <SelectItem value="paid">مدفوعة</SelectItem>
                <SelectItem value="cancelled">ملغية</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد فواتير مبيعات"
        emptyIcon={<FileText className="h-6 w-6 text-slate-400" />}
        noToolbar
      />
    </div>
  );
}

// ─── Tab 3: Nusk invoices (UMR-005 — full CRUD on /umrah/nusk-invoices) ─────
const nuskSchema = z.object({
  nuskInvoiceNumber: z.string().min(1, "رقم فاتورة نسك مطلوب"),
  agentId: z.string().min(1, "الوكيل مطلوب"),
  subAgentId: z.string().optional(),
  groupId: z.string().optional(),
  mutamerCount: z.string(),
  groundServices: z.string(),
  visaFees: z.string(),
  insuranceFees: z.string(),
  transportTotal: z.string(),
  hotelTotal: z.string(),
  additionalServices: z.string(),
  totalAmount: z.string(),
  nuskStatus: z.enum(["pending", "paid", "in_progress", "expired", "refunded", "cancelled"]),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
});
type NuskForm = z.infer<typeof nuskSchema>;

const NUSK_INITIAL: NuskForm = {
  nuskInvoiceNumber: "",
  agentId: "",
  subAgentId: "",
  groupId: "",
  mutamerCount: "0",
  groundServices: "0",
  visaFees: "0",
  insuranceFees: "0",
  transportTotal: "0",
  hotelTotal: "0",
  additionalServices: "0",
  totalAmount: "0",
  nuskStatus: "pending",
  issueDate: "",
  expiryDate: "",
};

const NUSK_STATUS_OPTIONS = [
  { value: "pending", label: "معلقة" },
  { value: "paid", label: "مدفوعة" },
  { value: "in_progress", label: "قيد المعالجة" },
  { value: "expired", label: "منتهية" },
  { value: "refunded", label: "مُستردة" },
  { value: "cancelled", label: "ملغية" },
];

function NuskInvoicesTab() {
  const [showNew, setShowNew] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { toast: _toast } = useToast();

  const { data, isLoading, isError, refetch, error } = useApiQuery<any>(["umrah-nusk-invoices"], "/umrah/nusk-invoices");
  const { data: agents } = useApiQuery<any>(["umrah-agents"], "/umrah/agents");
  const { data: subAgents } = useApiQuery<any>(["umrah-sub-agents"], "/umrah/sub-agents");
  const items = asList(data?.data || data);

  const createMut = useApiMutation<any, Record<string, unknown>>(
    "/umrah/nusk-invoices",
    "POST",
    [["umrah-nusk-invoices"]],
    {
      successMessage: "تم إنشاء فاتورة نسك",
      onSuccess: () => {
        setShowNew(false);
        setFormKey((k) => k + 1);
      },
    },
  );

  const deleteMut = useApiMutation<any, { id: number }>(
    (body) => `/umrah/nusk-invoices/${body.id}`,
    "DELETE",
    [["umrah-nusk-invoices"]],
    { successMessage: "تم حذف الفاتورة", onSuccess: () => setDeleteId(null) },
  );

  const submit = async (values: NuskForm) => {
    const num = (v: string) => Number(v || 0);
    await createMut.mutateAsync({
      nuskInvoiceNumber: values.nuskInvoiceNumber.trim(),
      agentId: Number(values.agentId),
      subAgentId: values.subAgentId ? Number(values.subAgentId) : undefined,
      groupId: values.groupId ? Number(values.groupId) : undefined,
      mutamerCount: num(values.mutamerCount),
      groundServices: num(values.groundServices),
      visaFees: num(values.visaFees),
      insuranceFees: num(values.insuranceFees),
      transportTotal: num(values.transportTotal),
      hotelTotal: num(values.hotelTotal),
      additionalServices: num(values.additionalServices),
      totalAmount: num(values.totalAmount),
      netCost: 0,
      nuskStatus: values.nuskStatus,
      issueDate: values.issueDate || undefined,
      expiryDate: values.expiryDate || undefined,
    });
  };

  const columns: DataTableColumn<any>[] = [
    { key: "nuskInvoiceNumber", header: "رقم النسك", render: (r) => <span className="font-mono text-sm">{r.nuskInvoiceNumber}</span> },
    { key: "agentName", header: "الوكيل", render: (r) => r.agentName || `#${r.agentId}` },
    { key: "subAgentName", header: "الوكيل الفرعي", render: (r) => r.subAgentName || "—" },
    { key: "mutamerCount", header: "المعتمرون" },
    { key: "totalAmount", header: "الإجمالي (ريال)", render: (r) => <span className="font-bold">{formatCurrency(Number(r.totalAmount || 0))}</span> },
    { key: "nuskStatus", header: "الحالة", render: (r) => <PageStatusBadge status={r.nuskStatus} /> },
    { key: "expiryDate", header: "تنتهي في", render: (r) => (r.expiryDate ? formatDateAr(r.expiryDate) : "—") },
    {
      key: "actions",
      header: "إجراء",
      render: (r) => (
        deleteId === r.id ? (
          <div className="inline-flex items-center gap-1">
            <GuardedButton perm="umrah:delete" variant="outline" size="sm" className="h-7 px-2 text-[11px] text-status-error-foreground" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate({ id: r.id })}>تأكيد</GuardedButton>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setDeleteId(null)}><X className="h-3 w-3" /></Button>
          </div>
        ) : (
          <GuardedButton perm="umrah:delete" variant="ghost" size="sm" className="h-7 px-2 text-status-error-foreground" onClick={() => setDeleteId(r.id)} disabled={r.nuskStatus === "paid"}>
            <Trash2 className="h-3 w-3" />
          </GuardedButton>
        )
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">إدارة فواتير nusk الصادرة عن النظام السعودي.</p>
        {!showNew && (
          <GuardedButton perm="umrah:create" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 ml-1" /> فاتورة نسك جديدة
          </GuardedButton>
        )}
      </div>

      {showNew && (
        <Card className="border-status-info-surface">
          <CardContent className="p-4">
            <FormShell
              key={formKey}
              schema={nuskSchema}
              defaultValues={NUSK_INITIAL}
              submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ"}
              secondaryActions={
                <Button type="button" variant="outline" onClick={() => setShowNew(false)}>إلغاء</Button>
              }
              onSubmit={submit}
            >
              <FormGrid cols={3}>
                <FormTextField name="nuskInvoiceNumber" label="رقم فاتورة نسك" required />
                <FormSelectField
                  name="agentId"
                  label="الوكيل"
                  required
                  options={asList(agents?.data).map((a: any) => ({ value: String(a.id), label: a.name }))}
                  placeholder="اختر الوكيل"
                />
                <FormSelectField
                  name="subAgentId"
                  label="الوكيل الفرعي"
                  options={asList(subAgents?.data).map((s: any) => ({ value: String(s.id), label: s.name }))}
                  placeholder="—"
                />
                <FormNumberField name="mutamerCount" label="عدد المعتمرين" />
                <FormNumberField name="groundServices" label="الخدمات الأرضية" />
                <FormNumberField name="visaFees" label="رسوم التأشيرة" />
                <FormNumberField name="insuranceFees" label="رسوم التأمين" />
                <FormNumberField name="transportTotal" label="إجمالي النقل" />
                <FormNumberField name="hotelTotal" label="إجمالي الفنادق" />
                <FormNumberField name="additionalServices" label="خدمات إضافية" />
                <FormNumberField name="totalAmount" label="الإجمالي" />
                <FormSelectField name="nuskStatus" label="الحالة" options={NUSK_STATUS_OPTIONS} />
                <FormDateField name="issueDate" label="تاريخ الإصدار" />
                <FormDateField name="expiryDate" label="تاريخ الانتهاء" />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد فواتير نسك"
        emptyIcon={<DollarSign className="h-6 w-6 text-slate-400" />}
        noToolbar
      />
    </div>
  );
}
