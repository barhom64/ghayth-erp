/**
 * Legal module landing page. Conflict #10 in
 * `docs/audit/GHAITH_SYSTEM_GAP_MATRIX.md`. Resolved as **keep** —
 * same rationale as finance/dashboard + hr.tsx + fleet.tsx: a
 * domain-specific landing with legal-only queries and tab structure,
 * not a duplicate of /module-dashboards?tab=legal.
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// P4.7 — Legal sweep: shared header + status chips, via @workspace/ui-core.
import {
  DataTable,
  type DataTableColumn,
  PageShell,
  PageStatusBadge,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
} from "@workspace/ui-core";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageStateWrapper } from "@/components/shared/page-state";
import { FileText, Gavel, Plus, Scale, Copy, ExternalLink, Mail, BarChart2, DollarSign, CheckCircle, AlertTriangle } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { KpiGrid } from "@/components/shared/kpi-card";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { useAppContext } from "@/contexts/app-context";
import { LegalTabsNav } from "@/components/shared/legal-tabs-nav";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

// Seed initial tab from the URL — /legal/cases, /legal/contracts, /legal/financial,
// /legal/documents all route here, and without this seed each would land on
// the "contracts" tab regardless of the link the user clicked.
const LEGAL_PATH_TAB: Record<string, string> = {
  "/legal/cases": "cases",
  "/legal/contracts": "contracts",
  "/legal/financial": "financial",
  "/legal/documents": "contracts",
};

export default function Legal() {
  const [location] = useLocation();
  const [tab, setTab] = useState(() => LEGAL_PATH_TAB[location] ?? "contracts");
  const { data: stats } = useApiQuery(["legal-stats"], "/legal/stats");
  const s: any = stats || {};
  return (
    <PageShell
      title="الشؤون القانونية"
      subtitle="العقود والقضايا والجلسات والأحكام"
      breadcrumbs={[{ label: "القانونية" }]}
    >
      <LegalTabsNav />
      <KpiGrid items={[
        { label: "إجمالي القضايا", value: (s.openCases || 0) + (s.closedCases || 0), icon: Scale, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "نشطة", value: s.activeContracts || 0, icon: CheckCircle, color: "text-emerald-600 bg-emerald-50" },
        { label: "منتهية", value: s.expiringContracts || 0, icon: Gavel, color: "text-status-warning-foreground bg-status-warning-surface" },
        { label: "قيمة المطالبات", value: formatCurrency(s.contingentLiabilities || 0), icon: DollarSign, color: "text-purple-600 bg-purple-50" },
      ]} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="contracts" className="gap-2"><FileText className="h-4 w-4" /> العقود</TabsTrigger>
          <TabsTrigger value="cases" className="gap-2"><Gavel className="h-4 w-4" /> القضايا</TabsTrigger>
          <TabsTrigger value="financial" className="gap-2"><BarChart2 className="h-4 w-4" /> المالي</TabsTrigger>
        </TabsList>
        <TabsContent value="contracts" className="mt-6"><ContractsTab /></TabsContent>
        <TabsContent value="cases" className="mt-6"><CasesTab /></TabsContent>
        <TabsContent value="financial" className="mt-6"><FinancialLegalTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}

function ContractsTab() {
  const [, navigate] = useLocation();
  const { data: stats } = useApiQuery<any>(["legal-stats"], "/legal/stats");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useFilters();
  const pageSize = 20;
  const { permissions } = useAppContext();
  const canManage = permissions.canManageLegal;
  // #2713 (تعميم) — سلة المحذوفات للعقود.
  const [showDeleted, setShowDeleted] = useState(false);
  const { toast } = useToast();
  const { data: contractsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["legal-contracts", String(page), showDeleted ? "deleted" : "active"], `/legal/contracts?page=${page}&limit=${pageSize}${showDeleted ? "&deleted=true" : ""}`
  );
  const contracts = asList(contractsResp);
  const total = contractsResp?.total || contracts.length;

  // GET /legal/contracts/renewal-alerts — returns contracts expiring
  // within the alerting horizon. Surface as a "soon to expire" banner
  // above the list when there's at least one alert.
  const { data: alertsResp } = useApiQuery<any>(
    ["legal-renewal-alerts"],
    "/legal/contracts/renewal-alerts",
  );
  const renewalAlerts: any[] = alertsResp?.data || [];

  const filtered = applyFilters(contracts, filters, {
    searchFields: ["title", "partyName", "contractType"],
    statusField: "status",
    dateField: "",
  });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/legal/contracts",
    queryKeys: [["legal-contracts", String(page)], ["legal-stats"]],
    onSuccess: () => refetch(),
  });

  async function handleRestoreContract(id: number) {
    try {
      await apiFetch(`/legal/contracts/${id}/restore`, { method: "POST" });
      toast({ title: "تم استرجاع العقد" });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e?.message || "تعذّر الاسترجاع" });
    }
  }

  const editFields = [
    { key: "title", label: "العنوان" },
    { key: "contractType", label: "النوع" },
    { key: "partyName", label: "الطرف" },
    { key: "value", label: "القيمة", type: "number" as const },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "draft", label: "مسودة" }, { value: "active", label: "ساري" }, { value: "expired", label: "منتهي" }, { value: "terminated", label: "ملغي" }] },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "title", header: "العنوان", sortable: true, render: (c) => <span className="font-medium">{c.title}</span> },
    { key: "contractType", header: "النوع", sortable: true, render: (c) => c.contractType || "-" },
    { key: "partyName", header: "الطرف", sortable: true, render: (c) => c.partyName || "-" },
    { key: "startDate", header: "من", sortable: true, render: (c) => formatDateAr(c.startDate) },
    { key: "endDate", header: "إلى", sortable: true, render: (c) => formatDateAr(c.endDate) },
    { key: "value", header: "القيمة", sortable: true, render: (c) => c.value ? formatCurrency(Number(c.value)) : "-" },
    { key: "status", header: "الحالة", sortable: true, render: (c) => <PageStatusBadge status={c.status} domain="legal_case" /> },
    {
      key: "actions", header: "الإجراءات",
      render: (c) => (
        <div className="flex items-center gap-1">
          {showDeleted ? (
            <Button variant="outline" size="sm" onClick={() => handleRestoreContract(c.id)}>استرجاع</Button>
          ) : (
            <>
              <RowActions
                canEdit={canManage}
                onEdit={() => startEdit(c.id, { title: c.title, contractType: c.contractType || "", partyName: c.partyName || "", value: Number(c.value) || 0, status: c.status || "draft" })}
                onDelete={() => startDelete(c.id)}
                deletePerm="legal:delete"
              />
              <Button asChild variant="ghost" size="sm" className="h-7 px-2" title="نسخ العقد"><Link href={`/legal/create?copyFrom=${c.id}`}>
                  <Copy className="h-4 w-4" />
                </Link></Button>
            </>
          )}
        </div>
      ),
    },
  ];

  if (isError) return <PageStateWrapper error={error} onRetry={refetch}><div /></PageStateWrapper>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">إجمالي العقود</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.totalContracts || 0}</div></CardContent></Card>
        <Card className="bg-emerald-600 text-white"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">عقود سارية</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.activeContracts || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-status-warning-foreground">تنتهي خلال 30 يوم</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-status-warning-foreground">{stats?.expiringContracts || 0}</div></CardContent></Card>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالعنوان أو الطرف أو النوع...",
              statuses: [
                { value: "draft", label: "مسودة" },
                { value: "active", label: "ساري" },
                { value: "expired", label: "منتهي" },
                { value: "terminated", label: "ملغي" },
              ],
              showDateRange: true,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filtered, [
              { key: "title", label: "العنوان" },
              { key: "contractType", label: "النوع" },
              { key: "partyName", label: "الطرف" },
              { key: "startDate", label: "من" },
              { key: "endDate", label: "إلى" },
              { key: "value", label: "القيمة" },
              { key: "status", label: "الحالة" },
            ], "العقود")}
            resultCount={filtered.length}
          />
        </div>
        <PrintButton
          entityType="report_legal_contracts"
          entityId="list"
          size="icon"
          label="طباعة قائمة العقود"
          payload={() => ({
            entity: { title: "قائمة العقود القانونية", total: printRows.length },
            items: printRows.map((c: any) => ({
              "العنوان": c.title || "—",
              "النوع": c.contractType || "—",
              "الطرف": c.partyName || "—",
              "من": c.startDate ? formatDateAr(c.startDate) : "—",
              "إلى": c.endDate ? formatDateAr(c.endDate) : "—",
              "القيمة": Number(c.value || 0),
              "الحالة": c.status || "—",
            })),
          })}
        />
        {canManage && <Link href="/legal/create"><GuardedButton perm="legal:create" className="gap-2"><Plus className="h-4 w-4" /> عقد جديد</GuardedButton></Link>}
      </div>

      {renewalAlerts.length > 0 && (
        <Card className="border-status-warning-surface bg-status-warning-surface/40">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-status-warning-foreground mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> عقود تحتاج تجديد ({renewalAlerts.length})
            </h3>
            <div className="space-y-1 text-xs">
              {renewalAlerts.slice(0, 6).map((a: any) => (
                <Link key={a.id} href={`/legal/contracts/${a.id}`} className="flex justify-between px-2 py-1 rounded hover:bg-white/50">
                  <span className="font-medium">{a.title}</span>
                  <span className="text-muted-foreground">ينتهي: {a.endDate}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{showDeleted ? "العقود المحذوفة" : "العقود القانونية"}</CardTitle>
          <Button variant={showDeleted ? "default" : "outline"} size="sm" onClick={() => { setShowDeleted((v) => !v); setPage(1); }}>
            {showDeleted ? "العقود النشطة" : "سلة المحذوفات"}
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            onSortedDataChange={setPrintRows}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            onRowClick={(c) => navigate(`/legal/contracts/${c.id}`)}
            emptyMessage="لا توجد عقود"
            emptyIcon={<FileText className="h-6 w-6 text-slate-400" />}
            noToolbar
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            renderRowExtras={(c) => {
              if (editingId === c.id) return <InlineEditForm fields={editFields} initialValues={editForm} onSave={(values) => handleSave(c.id, values)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === c.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(c.id)} onCancel={cancelDelete} isPending={isPending} itemName={c.title} entityType="legal-contract" entityId={c.id} />;
              return null;
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function CasesTab() {
  const { permissions } = useAppContext();
  const canManage = permissions.canManageLegal;
  const [, setLocation] = useLocation();
  // #2713 (تعميم) — سلة المحذوفات للقضايا.
  const [showDeleted, setShowDeleted] = useState(false);
  const { toast } = useToast();
  const { data: casesResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["legal-cases", showDeleted ? "deleted" : "active"],
    `/legal/cases${showDeleted ? "?deleted=true" : ""}`,
  );
  const cases = asList(casesResp);
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(cases, filters, {
    searchFields: ["title", "opposingParty", "caseNumber"],
    statusField: "status",
  });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/legal/cases",
    queryKeys: [["legal-cases"], ["legal-stats"]],
    onSuccess: () => refetch(),
  });

  async function handleRestoreCase(id: number) {
    try {
      await apiFetch(`/legal/cases/${id}/restore`, { method: "POST" });
      toast({ title: "تم استرجاع القضية" });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e?.message || "تعذّر الاسترجاع" });
    }
  }

  const editFields = [
    { key: "title", label: "العنوان" },
    { key: "court", label: "المحكمة" },
    { key: "opposingParty", label: "الخصم" },
    { key: "lawyerName", label: "المحامي" },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "open", label: "مفتوح" }, { value: "in_progress", label: "جاري" }, { value: "closed", label: "مغلق" }, { value: "won", label: "ربح" }, { value: "lost", label: "خسارة" }] },
    { key: "priority", label: "الأولوية", type: "select" as const, options: [{ value: "low", label: "منخفضة" }, { value: "medium", label: "متوسطة" }, { value: "high", label: "عالية" }] },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "caseNumber", header: "رقم القضية", sortable: true, render: (c) => <span className="font-mono">{c.caseNumber || "-"}</span> },
    {
      key: "title", header: "العنوان", sortable: true,
      render: (c) => (
        <button onClick={() => setLocation(`/legal/cases/${c.id}`)} className="hover:underline text-status-info-foreground flex items-center gap-1 font-medium">
          {c.title} <ExternalLink className="h-3 w-3 opacity-50" />
        </button>
      ),
    },
    { key: "court", header: "المحكمة", sortable: true, render: (c) => c.court || "-" },
    { key: "opposingParty", header: "الخصم", sortable: true, render: (c) => c.opposingParty || "-" },
    { key: "lawyerName", header: "المحامي", sortable: true, render: (c) => c.lawyerName || "-" },
    { key: "priority", header: "الأولوية", sortable: true, render: (c) => <PageStatusBadge status={c.priority} /> },
    { key: "status", header: "الحالة", sortable: true, render: (c) => <PageStatusBadge status={c.status} domain="legal_case" /> },
    {
      key: "actions", header: "الإجراءات",
      render: (c) => (
        showDeleted ? (
          <Button variant="outline" size="sm" onClick={() => handleRestoreCase(c.id)}>استرجاع</Button>
        ) : (
          <RowActions
            canEdit={canManage}
            onEdit={() => startEdit(c.id, { title: c.title, court: c.court || "", opposingParty: c.opposingParty || "", lawyerName: c.lawyerName || "", status: c.status || "open", priority: c.priority || "medium" })}
            onDelete={() => startDelete(c.id)}
            deletePerm="legal:delete"
          />
        )
      ),
    },
  ];

  if (isError) return <PageStateWrapper error={error} onRetry={refetch}><div /></PageStateWrapper>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالعنوان أو الخصم أو رقم القضية...",
              statuses: [
                { value: "open", label: "مفتوح" },
                { value: "in_progress", label: "جاري" },
                { value: "closed", label: "مغلق" },
                { value: "won", label: "ربح" },
                { value: "lost", label: "خسارة" },
              ],
              showDateRange: false,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filtered, [
              { key: "caseNumber", label: "رقم القضية" },
              { key: "title", label: "العنوان" },
              { key: "court", label: "المحكمة" },
              { key: "opposingParty", label: "الخصم" },
              { key: "lawyerName", label: "المحامي" },
              { key: "priority", label: "الأولوية" },
              { key: "status", label: "الحالة" },
            ], "القضايا")}
            resultCount={filtered.length}
          />
        </div>
        <PrintButton
          entityType="report_legal_cases"
          entityId="list"
          size="icon"
          label="طباعة قائمة القضايا"
          payload={() => ({
            entity: { title: "قائمة القضايا القانونية", total: printRows.length },
            items: printRows.map((c: any) => ({
              "رقم القضية": c.caseNumber || "—",
              "العنوان": c.title || "—",
              "المحكمة": c.court || "—",
              "الخصم": c.opposingParty || "—",
              "المحامي": c.lawyerName || "—",
              "الأولوية": c.priority || "—",
              "الحالة": c.status || "—",
            })),
          })}
        />
        <Button variant={showDeleted ? "default" : "outline"} size="sm" onClick={() => setShowDeleted((v) => !v)}>
          {showDeleted ? "القضايا النشطة" : "سلة المحذوفات"}
        </Button>
        <Link href="/legal/cases/create"><GuardedButton perm="legal:create" className="gap-2"><Plus className="h-4 w-4" /> قضية جديدة</GuardedButton></Link>
      </div>
      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={filtered}
            onSortedDataChange={setPrintRows}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد قضايا"
            emptyIcon={<Scale className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
            onRowClick={(row) => setLocation(`/legal/cases/${row.id}`)}
            renderRowExtras={(c) => {
              if (editingId === c.id) return <InlineEditForm fields={editFields} initialValues={editForm} onSave={(values) => handleSave(c.id, values)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === c.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(c.id)} onCancel={cancelDelete} isPending={isPending} itemName={c.title} entityType="legal-case" entityId={c.id} />;
              return null;
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function FinancialLegalTab() {
  const { data: reportResp, isLoading, isError, error, refetch } = useApiQuery<any>(["legal-financial-report"], "/legal/financial-report");
  const report = reportResp || {};

  const RISK_COLORS: Record<string, string> = {
    critical: "text-status-error-foreground bg-status-error-surface border-status-error-surface",
    high: "text-orange-700 bg-orange-50 border-orange-200",
    medium: "text-status-warning-foreground bg-status-warning-surface border-status-warning-surface",
    low: "text-status-success-foreground bg-status-success-surface border-status-success-surface",
  };
  const RISK_LABELS: Record<string, string> = {
    critical: "حرجة", high: "عالية", medium: "متوسطة", low: "منخفضة",
  };

  if (isError) return <PageStateWrapper error={error} onRetry={refetch}><div /></PageStateWrapper>;

  return (
    <div className="space-y-5">
      {isLoading ? (
        <div className="h-32 bg-surface-subtle rounded animate-pulse" />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xl font-bold text-status-error-foreground">{formatCurrency(report.totalContingentLiabilities || 0)}</p>
                <p className="text-xs text-muted-foreground">الالتزامات المحتملة</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xl font-bold text-status-warning-foreground">{formatCurrency(report.highRiskAmount || 0)}</p>
                <p className="text-xs text-muted-foreground">مخاطر عالية/حرجة</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xl font-bold text-purple-600">{formatCurrency(report.totalJudgmentAmount || 0)}</p>
                <p className="text-xs text-muted-foreground">مبالغ الأحكام</p>
              </CardContent>
            </Card>
          </div>

          {(report.casesByRisk || []).length > 0 && (
            <Card>
              <CardHeader><CardTitle>القضايا حسب مستوى المخاطر المالية</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(report.casesByRisk || []).map((c: any) => (
                    <div key={c.id} className={`flex items-center justify-between p-3 rounded-lg border ${RISK_COLORS[c.riskLevel] || "bg-surface-subtle border-border"}`}>
                      <div>
                        <p className="font-medium text-sm">{c.title}</p>
                        <p className="text-xs mt-0.5 opacity-75">{c.court || "-"} — {c.opposingParty || "-"}</p>
                      </div>
                      <div className="text-end">
                        <p className="font-bold text-sm">{formatCurrency(c.financialRisk || 0)}</p>
                        <p className="text-xs mt-0.5 font-medium">{RISK_LABELS[c.riskLevel] || c.riskLevel}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {(report.recentJudgments || []).length > 0 && (
            <Card>
              <CardHeader><CardTitle>الأحكام الأخيرة</CardTitle></CardHeader>
              <CardContent className="p-0">
                <DataTable
                  noToolbar
                  pageSize={0}
                  data={report.recentJudgments || []}
                  emptyMessage="لا توجد أحكام"
                  columns={[
                    { key: "caseTitle", header: "القضية", className: "font-medium", render: (j: any) => j.caseTitle || `قضية #${j.caseId}` },
                    { key: "judgmentDate", header: "تاريخ الحكم", render: (j: any) => j.judgmentDate ? formatDateAr(j.judgmentDate) : "-" },
                    {
                      key: "verdict",
                      header: "النتيجة",
                      render: (j: any) => (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${j.verdict === 'win' ? 'bg-status-success-surface text-status-success-foreground' : j.verdict === 'loss' ? 'bg-status-error-surface text-status-error-foreground' : 'bg-surface-subtle text-status-neutral-foreground'}`}>
                          {j.verdict === 'win' ? 'ربح' : j.verdict === 'loss' ? 'خسارة' : j.verdict || "-"}
                        </span>
                      ),
                    },
                    { key: "amount", header: "المبلغ", render: (j: any) => formatCurrency(j.amount || 0) },
                    { key: "paidAmount", header: "المدفوع", render: (j: any) => formatCurrency(j.paidAmount || 0) },
                  ]}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
