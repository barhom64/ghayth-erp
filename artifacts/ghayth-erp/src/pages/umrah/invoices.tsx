import { useState } from "react";
import { useLocation } from "wouter";
import { formatCurrency, formatUmrahDate } from "@/lib/formatters";
import { useApiQuery, useApiMutation, apiFetch, asList } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  PageShell,
  resolveStatus,
} from "@workspace/ui-core";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UmrahAgentSelect, UmrahSeasonSelect } from "@/components/shared/entity-selects";
import { useToast } from "@/hooks/use-toast";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Receipt, DollarSign, FileText, Plus, X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

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
    <PageShell
      title="فواتير العمرة"
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "فواتير العمرة" }]}
    >
      <UmrahTabsNav />
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
    </PageShell>
  );
}

// ─── Tab 1: Agent invoices (preserves prior behaviour) ──────────────────────
function AgentInvoicesTab() {
  const [, navigate] = useLocation();
  const { data: resp, refetch, isLoading, isError, error } = useApiQuery<any>(["umrah-agent-invoices"], "/umrah/agent-invoices");
  const items = resp?.data || [];
  const [filters, setFilters] = useFilters();
  const [genAgent, setGenAgent] = useState("");
  const [genSeason, setGenSeason] = useState("");
  const { toast } = useToast();

  // NOTE: usePrintRows (and the derived filteredItems it consumes) MUST run
  // before any early return — it calls useState internally, so gating it behind
  // the isLoading/isError returns below changes the hook count between renders
  // and crashes with React error #310 (see memory: useprintrows-hooks-crash).
  const filteredItems = items.filter((inv: any) => {
    if (filters.status && inv.status !== filters.status) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      return inv.ref?.toLowerCase().includes(q) || inv.agentName?.toLowerCase().includes(q) || inv.seasonTitle?.toLowerCase().includes(q);
    }
    return true;
  });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filteredItems);

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

  const totalAmount = items.reduce((sum: number, inv: any) => sum + Number(inv.total || 0), 0);
  const paidAmount = items.filter((inv: any) => inv.status === "paid").reduce((sum: number, inv: any) => sum + Number(inv.total || 0), 0);

  const kpiCards = [
    { label: "إجمالي الفواتير", value: items.length, icon: FileText, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "الإجمالي (ريال)", value: formatCurrency(totalAmount), icon: DollarSign, color: "text-purple-600 bg-purple-50" },
    { label: "المدفوع (ريال)", value: formatCurrency(paidAmount), icon: Receipt, color: "text-status-success-foreground bg-status-success-surface" },
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
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <UmrahAgentSelect
              label="الوكيل"
              placeholder="اختر الوكيل"
              allowCreate={false}
              value={genAgent}
              onChange={setGenAgent}
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <UmrahSeasonSelect
              label="الموسم"
              placeholder="اختر الموسم"
              allowCreate={false}
              value={genSeason}
              onChange={setGenSeason}
            />
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

      <div className="flex justify-end">
        <PrintButton
          entityType="report_umrah_agent_invoices"
          entityId="list"
          size="icon"
          label="طباعة قائمة فواتير الوكلاء"
          payload={() => ({
            entity: {
              title: "قائمة فواتير وكلاء العمرة",
              total: printRows.length,
              totalAmount,
              paidAmount,
            },
            items: printRows.map((inv: any) => ({
              "المرجع": inv.ref || "—",
              "الوكيل": inv.agentName || "—",
              "الموسم": inv.seasonTitle || "—",
              "عدد المعتمرين": inv.pilgrimCount ?? "—",
              "الخدمات": Number(inv.servicesTotal || 0),
              "الغرامات": Number(inv.penaltiesTotal || 0),
              "الإجمالي": Number(inv.total || 0),
              "الحالة": (inv.status && resolveStatus(inv.status)?.label) ?? inv.status ?? "—",
            })),
          })}
        />
      </div>

      <DataTable
        columns={[
          { key: "ref", header: "المرجع", render: (inv) => <span className="font-mono text-sm">{inv.ref}</span> },
          { key: "agentName", header: "الوكيل" },
          { key: "seasonTitle", header: "الموسم" },
          { key: "pilgrimCount", header: "عدد المعتمرين" },
          { key: "servicesTotal", header: "الخدمات (ريال)", render: (inv) => formatCurrency(Number(inv.servicesTotal)) },
          { key: "penaltiesTotal", header: "الغرامات (ريال)", render: (inv) => <span className="text-status-error-foreground">{formatCurrency(Number(inv.penaltiesTotal))}</span> },
          { key: "total", header: "الإجمالي (ريال)", render: (inv) => <span className="font-bold">{formatCurrency(Number(inv.total))}</span> },
          { key: "status", header: "الحالة", render: (inv) => <PageStatusBadge status={inv.status} /> },
          {
            key: "_print",
            header: "",
            render: (inv) => (
              <span onClick={(e) => e.stopPropagation()}>
                <PrintButton entityType="umrah_agent_invoice" entityId={inv.id} size="icon" variant="ghost" label="طباعة فاتورة الوكيل" />
              </span>
            ),
          },
        ] as DataTableColumn<any>[]}
        data={filteredItems}
        onSortedDataChange={setPrintRows}
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

  // Server-side filtering. We keep the URL as an inline template (rather
  // than via a `url` variable) so the audit scanner can credit
  // GET /umrah/invoices as the source endpoint.
  const filterSuffix = (() => {
    const q = new URLSearchParams();
    if (seasonId) q.set("seasonId", seasonId);
    if (subAgentId) q.set("subAgentId", subAgentId);
    if (status) q.set("status", status);
    const s = q.toString();
    return s ? `?${s}` : "";
  })();

  const { data, isLoading, isError, refetch, error } = useApiQuery<any>(
    ["umrah-sales-invoices", seasonId, subAgentId, status],
    `/umrah/invoices${filterSuffix}`,
  );
  // PATCH /umrah/invoices/:id — inline status update (e.g., mark
  // partially paid → fully paid after a manual reconciliation).
  const updateInvoiceMut = useApiMutation<unknown, { id: number; status: string }>(
    (b) => `/umrah/invoices/${b.id}`,
    "PATCH",
    [["umrah-sales-invoices"]],
    { successMessage: "تم تحديث حالة الفاتورة" },
  );
  const { data: seasons } = useApiQuery<any>(["umrah-seasons"], "/umrah/seasons");
  const { data: subAgents } = useApiQuery<any>(["umrah-sub-agents"], "/umrah/sub-agents");
  const items = asList(data?.data || data);
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(items);

  const columns: DataTableColumn<any>[] = [
    { key: "invoiceNumber", header: "رقم الفاتورة", render: (r) => <span className="font-mono text-sm">{r.invoiceNumber || r.ref || `#${r.id}`}</span> },
    { key: "clientName", header: "العميل", render: (r) => r.clientName || "—" },
    { key: "subAgentName", header: "الوكيل الفرعي", render: (r) => r.subAgentName || "—" },
    { key: "total", header: "الإجمالي (ريال)", render: (r) => <span className="font-bold">{formatCurrency(Number(r.total || r.totalAmount || 0))}</span> },
    {
      // Margin column — populated by umrahInvoicingEngine since PR #1457
      // (costBasis - sale = marginBase). RED when below zero (the
      // sellingBelowCost case from the engine) so loss situations are
      // visually obvious in the list. Falls back to "—" when the row
      // is from a pre-PR import that never wrote the column.
      key: "marginBase",
      header: "الهامش (ريال)",
      render: (r) => {
        if (r.marginBase == null) return <span className="text-muted-foreground">—</span>;
        const m = Number(r.marginBase);
        const t = Number(r.total || 0);
        const pct = t > 0 ? (m / t) * 100 : 0;
        const tone = m < 0
          ? "text-status-error-foreground"
          : m === 0
            ? "text-muted-foreground"
            : "text-status-success-foreground";
        return (
          <span className={`font-semibold ${tone}`} data-testid={`invoice-margin-${r.id}`}>
            {formatCurrency(m)}
            <span className="text-xs text-muted-foreground mr-1">({pct.toFixed(1)}%)</span>
          </span>
        );
      },
    },
    { key: "status", header: "الحالة", render: (r) => <PageStatusBadge status={r.status} /> },
    { key: "createdAt", header: "تاريخ الإنشاء", render: (r) => (r.createdAt ? formatUmrahDate(r.createdAt) : "—") },
    {
      key: "_quickStatus",
      header: "",
      render: (r) => (
        r.status === "pending" || r.status === "partial" ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              updateInvoiceMut.mutate({ id: r.id, status: "paid" });
            }}
            disabled={updateInvoiceMut.isPending}
            rateLimitAware
            title="تعليم كمدفوعة بالكامل"
          >
            مدفوعة
          </Button>
        ) : null
      ),
    },
    {
      key: "_print",
      header: "",
      render: (r) => (
        <span onClick={(e) => e.stopPropagation()}>
          <PrintButton entityType="umrah_sales_invoice" entityId={r.id} size="icon" variant="ghost" label="طباعة الفاتورة" />
        </span>
      ),
    },
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

      <div className="flex justify-end">
        <PrintButton
          entityType="report_umrah_sales_invoices"
          entityId="list"
          size="icon"
          label="طباعة قائمة فواتير المبيعات"
          payload={() => ({
            entity: {
              title: "قائمة فواتير مبيعات العمرة",
              total: printRows.length,
            },
            items: printRows.map((r: any) => ({
              "رقم الفاتورة": r.invoiceNumber || r.ref || `#${r.id}`,
              "العميل": r.clientName || "—",
              "الوكيل الفرعي": r.subAgentName || "—",
              "الإجمالي": Number(r.total || r.totalAmount || 0),
              "الهامش": r.marginBase == null ? "—" : Number(r.marginBase),
              "الحالة": (r.status && resolveStatus(r.status)?.label) ?? r.status ?? "—",
              "تاريخ الإنشاء": r.createdAt ? formatUmrahDate(r.createdAt) : "—",
            })),
          })}
        />
      </div>

      <DataTable
        columns={columns}
        data={items}
        onSortedDataChange={setPrintRows}
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
const NUSK_INITIAL = {
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

function NuskInvoicesTab() {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(NUSK_INITIAL);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data, isLoading, isError, refetch, error } = useApiQuery<any>(["umrah-nusk-invoices"], "/umrah/nusk-invoices");
  const { data: subAgents } = useApiQuery<any>(["umrah-sub-agents"], "/umrah/sub-agents");
  const items = asList(data?.data || data);
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(items);

  const createMut = useApiMutation<any, Record<string, unknown>>(
    "/umrah/nusk-invoices",
    "POST",
    [["umrah-nusk-invoices"]],
    {
      successMessage: "تم إنشاء فاتورة نسك",
      onSuccess: () => { setShowNew(false); setForm(NUSK_INITIAL); },
    },
  );

  const deleteMut = useApiMutation<any, { id: number }>(
    (body) => `/umrah/nusk-invoices/${body.id}`,
    "DELETE",
    [["umrah-nusk-invoices"]],
    { successMessage: "تم حذف الفاتورة", onSuccess: () => setDeleteId(null) },
  );
  // PATCH /umrah/nusk-invoices/:id — backend gates "paid" → only
  // "refunded" transition allowed. Quick status update so operators
  // don't have to delete+recreate to flip pending↔issued↔paid.
  const statusMut = useApiMutation<any, { id: number; nuskStatus: string }>(
    (body) => `/umrah/nusk-invoices/${body.id}`,
    "PATCH",
    [["umrah-nusk-invoices"]],
    { successMessage: "تم تحديث حالة الفاتورة" },
  );

  // PATCH /umrah/nusk-invoices/:id — quick status change (paid /
  // pending / cancelled). The editor below opens for full edits; this
  // is the inline-toggle path operators use most.
  const updateStatusMut = useApiMutation<any, { id: number; nuskStatus: string }>(
    (body) => `/umrah/nusk-invoices/${body.id}`,
    "PATCH",
    [["umrah-nusk-invoices"]],
    { successMessage: "تم تحديث حالة الفاتورة" },
  );

  // GET /umrah/nusk-invoices/:id — lazy detail fetch when the user
  // clicks "تفاصيل" on a row. Returns the full row with breakdown.
  const [detailId, setDetailId] = useState<number | null>(null);
  const { data: detailResp } = useApiQuery<any>(
    ["umrah-nusk-invoice-detail", String(detailId ?? 0)],
    detailId ? `/umrah/nusk-invoices/${detailId}` : null,
    { enabled: !!detailId },
  );
  const invoiceDetail = detailResp?.data ?? detailResp;

  const setField = (k: keyof typeof NUSK_INITIAL) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.nuskInvoiceNumber.trim() || !form.agentId) {
      toast({ variant: "destructive", title: "رقم الفاتورة والوكيل مطلوبان" });
      return;
    }
    const num = (k: keyof typeof NUSK_INITIAL) => Number(form[k] || 0);
    createMut.mutate({
      nuskInvoiceNumber: form.nuskInvoiceNumber.trim(),
      agentId: Number(form.agentId),
      subAgentId: form.subAgentId ? Number(form.subAgentId) : undefined,
      groupId: form.groupId ? Number(form.groupId) : undefined,
      mutamerCount: num("mutamerCount"),
      groundServices: num("groundServices"),
      visaFees: num("visaFees"),
      insuranceFees: num("insuranceFees"),
      transportTotal: num("transportTotal"),
      hotelTotal: num("hotelTotal"),
      additionalServices: num("additionalServices"),
      totalAmount: num("totalAmount"),
      netCost: 0,
      nuskStatus: form.nuskStatus,
      issueDate: form.issueDate || undefined,
      expiryDate: form.expiryDate || undefined,
    });
  };

  const columns: DataTableColumn<any>[] = [
    { key: "nuskInvoiceNumber", header: "رقم النسك", render: (r) => <span className="font-mono text-sm">{r.nuskInvoiceNumber}</span> },
    { key: "agentName", header: "الوكيل", render: (r) => r.agentName || `#${r.agentId}` },
    { key: "subAgentName", header: "الوكيل الفرعي", render: (r) => r.subAgentName || "—" },
    { key: "mutamerCount", header: "المعتمرون" },
    { key: "totalAmount", header: "الإجمالي (ريال)", render: (r) => <span className="font-bold">{formatCurrency(Number(r.totalAmount || 0))}</span> },
    { key: "nuskStatus", header: "الحالة", render: (r) => (
      <Select
        value={r.nuskStatus}
        onValueChange={(v) => statusMut.mutate({ id: r.id, nuskStatus: v })}
        disabled={r.nuskStatus === "paid"}
      >
        <SelectTrigger className="w-[140px] h-7 text-xs" onClick={(e) => e.stopPropagation()}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pending">معلقة</SelectItem>
          <SelectItem value="issued">صادرة</SelectItem>
          <SelectItem value="paid">مدفوعة</SelectItem>
          <SelectItem value="refunded">مرتجعة</SelectItem>
        </SelectContent>
      </Select>
    )},
    { key: "expiryDate", header: "تنتهي في", render: (r) => (r.expiryDate ? formatUmrahDate(r.expiryDate) : "—") },
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
          <div className="inline-flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setDetailId(r.id)}
            >
              تفاصيل
            </Button>
            {r.nuskStatus !== "paid" && r.nuskStatus !== "cancelled" && (
              <GuardedButton
                perm="umrah:create"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-status-success-foreground"
                onClick={() => updateStatusMut.mutate({ id: r.id, nuskStatus: "paid" })}
                disabled={updateStatusMut.isPending}
                rateLimitAware
                title="تعليم كمدفوعة"
              >
                ✓
              </GuardedButton>
            )}
            <GuardedButton perm="umrah:delete" variant="ghost" size="sm" className="h-7 px-2 text-status-error-foreground" onClick={() => setDeleteId(r.id)} disabled={r.nuskStatus === "paid"}>
              <Trash2 className="h-3 w-3" />
            </GuardedButton>
          </div>
        )
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">إدارة فواتير nusk الصادرة عن النظام السعودي.</p>
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_umrah_nusk_invoices"
            entityId="list"
            size="icon"
            label="طباعة قائمة فواتير نسك"
            payload={() => ({
              entity: {
                title: "قائمة فواتير نُسك",
                total: printRows.length,
              },
              items: printRows.map((r: any) => ({
                "رقم النسك": r.nuskInvoiceNumber || `#${r.id}`,
                "الوكيل": r.agentName || `#${r.agentId}`,
                "الوكيل الفرعي": r.subAgentName || "—",
                "المعتمرون": r.mutamerCount ?? "—",
                "الإجمالي": Number(r.totalAmount || 0),
                "الحالة": (r.nuskStatus && resolveStatus(r.nuskStatus)?.label) ?? r.nuskStatus ?? "—",
                "تنتهي في": r.expiryDate ? formatUmrahDate(r.expiryDate) : "—",
              })),
            })}
          />
          {!showNew && (
            <GuardedButton perm="umrah:create" onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4 ml-1" /> فاتورة نسك جديدة
            </GuardedButton>
          )}
        </div>
      </div>

      {showNew && (
        <Card className="border-status-info-surface">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><Label>رقم فاتورة نسك *</Label><Input value={form.nuskInvoiceNumber} onChange={(e) => setField("nuskInvoiceNumber")(e.target.value)} className="mt-1" /></div>
              <UmrahAgentSelect
                label="الوكيل *"
                placeholder="اختر الوكيل"
                value={form.agentId}
                onChange={setField("agentId")}
              />
              <div>
                <Label>الوكيل الفرعي</Label>
                <Select value={form.subAgentId || "none"} onValueChange={(v) => setField("subAgentId")(v === "none" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {asList(subAgents?.data).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>عدد المعتمرين</Label><Input type="number" dir="ltr" value={form.mutamerCount} onChange={(e) => setField("mutamerCount")(e.target.value)} className="mt-1" /></div>
              <div><Label>الخدمات الأرضية</Label><Input type="number" dir="ltr" value={form.groundServices} onChange={(e) => setField("groundServices")(e.target.value)} className="mt-1" /></div>
              <div><Label>رسوم التأشيرة</Label><Input type="number" dir="ltr" value={form.visaFees} onChange={(e) => setField("visaFees")(e.target.value)} className="mt-1" /></div>
              <div><Label>رسوم التأمين</Label><Input type="number" dir="ltr" value={form.insuranceFees} onChange={(e) => setField("insuranceFees")(e.target.value)} className="mt-1" /></div>
              <div><Label>إجمالي النقل</Label><Input type="number" dir="ltr" value={form.transportTotal} onChange={(e) => setField("transportTotal")(e.target.value)} className="mt-1" /></div>
              <div><Label>إجمالي الفنادق</Label><Input type="number" dir="ltr" value={form.hotelTotal} onChange={(e) => setField("hotelTotal")(e.target.value)} className="mt-1" /></div>
              <div><Label>خدمات إضافية</Label><Input type="number" dir="ltr" value={form.additionalServices} onChange={(e) => setField("additionalServices")(e.target.value)} className="mt-1" /></div>
              <div><Label>الإجمالي</Label><Input type="number" dir="ltr" value={form.totalAmount} onChange={(e) => setField("totalAmount")(e.target.value)} className="mt-1" /></div>
              <div>
                <Label>الحالة</Label>
                <Select value={form.nuskStatus} onValueChange={setField("nuskStatus")}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">معلقة</SelectItem>
                    <SelectItem value="paid">مدفوعة</SelectItem>
                    <SelectItem value="in_progress">قيد المعالجة</SelectItem>
                    <SelectItem value="expired">منتهية</SelectItem>
                    <SelectItem value="refunded">مُستردة</SelectItem>
                    <SelectItem value="cancelled">ملغية</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>تاريخ الإصدار</Label><Input type="date" value={form.issueDate} onChange={(e) => setField("issueDate")(e.target.value)} className="mt-1" /></div>
              <div><Label>تاريخ الانتهاء</Label><Input type="date" value={form.expiryDate} onChange={(e) => setField("expiryDate")(e.target.value)} className="mt-1" /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowNew(false); setForm(NUSK_INITIAL); }}>إلغاء</Button>
              <GuardedButton perm="umrah:create" disabled={createMut.isPending || !form.nuskInvoiceNumber.trim() || !form.agentId} onClick={submit} rateLimitAware>
                {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
              </GuardedButton>
            </div>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={items}
        onSortedDataChange={setPrintRows}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد فواتير نسك"
        emptyIcon={<DollarSign className="h-6 w-6 text-slate-400" />}
        noToolbar
      />

      {detailId !== null && invoiceDetail && (
        <Card className="border-status-info-surface">
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-semibold">فاتورة نُسك {invoiceDetail.nuskInvoiceNumber ?? `#${detailId}`}</p>
              <Button variant="ghost" size="sm" onClick={() => setDetailId(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">الوكيل:</span> {invoiceDetail.agentName ?? `#${invoiceDetail.agentId ?? "—"}`}</div>
              <div><span className="text-muted-foreground">عدد المعتمرين:</span> {invoiceDetail.mutamerCount}</div>
              <div><span className="text-muted-foreground">رسوم الإقامة:</span> {formatCurrency(Number(invoiceDetail.groundServices ?? 0))}</div>
              <div><span className="text-muted-foreground">رسوم تأشيرة:</span> {formatCurrency(Number(invoiceDetail.visaFees ?? 0))}</div>
              <div><span className="text-muted-foreground">رسوم تأمين:</span> {formatCurrency(Number(invoiceDetail.insuranceFees ?? 0))}</div>
              <div><span className="text-muted-foreground">نقل:</span> {formatCurrency(Number(invoiceDetail.transportTotal ?? 0))}</div>
              <div><span className="text-muted-foreground">فندق:</span> {formatCurrency(Number(invoiceDetail.hotelTotal ?? 0))}</div>
              <div><span className="text-muted-foreground">خدمات إضافية:</span> {formatCurrency(Number(invoiceDetail.additionalServices ?? 0))}</div>
              <div className="col-span-2 border-t pt-1 font-bold">
                <span className="text-muted-foreground">الإجمالي:</span> {formatCurrency(Number(invoiceDetail.totalAmount ?? 0))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
