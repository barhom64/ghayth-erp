import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useApiQuery, asList } from "@/lib/api";
import { FileText, Gavel, Plus, Scale, Copy, ExternalLink } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";

export default function Legal() {
  const [tab, setTab] = useState("contracts");
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">الشؤون القانونية</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="contracts" className="gap-2"><FileText className="h-4 w-4" /> العقود</TabsTrigger>
          <TabsTrigger value="cases" className="gap-2"><Gavel className="h-4 w-4" /> القضايا</TabsTrigger>
        </TabsList>
        <TabsContent value="contracts" className="mt-6"><ContractsTab /></TabsContent>
        <TabsContent value="cases" className="mt-6"><CasesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function ContractsTab() {
  const { data: stats } = useApiQuery<any>(["legal-stats"], "/legal/stats");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useFilters();
  const pageSize = 20;
  const { permissions } = useAppContext();
  const canManage = permissions.canManageLegal;
  const { data: contractsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["legal-contracts", String(page)], `/legal/contracts?page=${page}&limit=${pageSize}`
  );
  const contracts = asList(contractsResp);
  const total = contractsResp?.total || contracts.length;

  const filtered = applyFilters(contracts, filters, {
    searchFields: ["title", "partyName", "contractType"],
    statusField: "",
    dateField: "",
  });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/legal/contracts",
    queryKeys: [["legal-contracts", String(page)], ["legal-stats"]],
    onSuccess: () => refetch(),
  });

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
    { key: "status", header: "الحالة", sortable: true, render: (c) => <StatusBadge status={c.status} /> },
    {
      key: "actions", header: "الإجراءات",
      render: (c) => (
        <div className="flex items-center gap-1">
          <RowActions
            canEdit={canManage}
            onEdit={() => startEdit(c.id, { title: c.title, contractType: c.contractType || "", partyName: c.partyName || "", value: Number(c.value) || 0, status: c.status || "draft" })}
            onDelete={() => startDelete(c.id)}
          />
          <Link href={`/legal/create?copyFrom=${c.id}`}>
            <Button variant="ghost" size="sm" className="h-7 px-2" title="نسخ العقد">
              <Copy className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">إجمالي العقود</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.totalContracts || 0}</div></CardContent></Card>
        <Card className="bg-emerald-600 text-white"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">عقود سارية</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.activeContracts || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-amber-600">تنتهي خلال 30 يوم</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-amber-600">{stats?.expiringContracts || 0}</div></CardContent></Card>
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
        {canManage && <Link href="/legal/create"><Button className="gap-2"><Plus className="h-4 w-4" /> عقد جديد</Button></Link>}
      </div>

      <Card>
        <CardHeader><CardTitle>العقود القانونية</CardTitle></CardHeader>
        <CardContent>
          <DataTable<any>
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد عقود"
            emptyIcon={<FileText className="h-6 w-6 text-slate-400" />}
            noToolbar
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            renderRowExtras={(c) => {
              if (editingId === c.id) return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(c.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === c.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(c.id)} onCancel={cancelDelete} isPending={isPending} itemName={c.title} entityType="legal_contract" entityId={c.id} />;
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
  const { data: casesResp, isLoading, isError, error, refetch } = useApiQuery<any>(["legal-cases"], "/legal/cases");
  const cases = asList(casesResp);
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(cases, filters, {
    searchFields: ["title", "opposingParty", "caseNumber"],
    statusField: "",
  });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/legal/cases",
    queryKeys: [["legal-cases"], ["legal-stats"]],
    onSuccess: () => refetch(),
  });

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
        <button onClick={() => setLocation(`/legal/cases/${c.id}`)} className="hover:underline text-blue-700 flex items-center gap-1 font-medium">
          {c.title} <ExternalLink className="h-3 w-3 opacity-50" />
        </button>
      ),
    },
    { key: "court", header: "المحكمة", sortable: true, render: (c) => c.court || "-" },
    { key: "opposingParty", header: "الخصم", sortable: true, render: (c) => c.opposingParty || "-" },
    { key: "lawyerName", header: "المحامي", sortable: true, render: (c) => c.lawyerName || "-" },
    { key: "priority", header: "الأولوية", sortable: true, render: (c) => <StatusBadge status={c.priority} /> },
    { key: "status", header: "الحالة", sortable: true, render: (c) => <StatusBadge status={c.status} /> },
    {
      key: "actions", header: "الإجراءات",
      render: (c) => (
        <RowActions
          canEdit={canManage}
          onEdit={() => startEdit(c.id, { title: c.title, court: c.court || "", opposingParty: c.opposingParty || "", lawyerName: c.lawyerName || "", status: c.status || "open", priority: c.priority || "medium" })}
          onDelete={() => startDelete(c.id)}
        />
      ),
    },
  ];

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
        <Link href="/legal/cases/create"><Button className="gap-2"><Plus className="h-4 w-4" /> قضية جديدة</Button></Link>
      </div>
      <Card>
        <CardContent className="pt-6">
          <DataTable<any>
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد قضايا"
            emptyIcon={<Scale className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
            renderRowExtras={(c) => {
              if (editingId === c.id) return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(c.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === c.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(c.id)} onCancel={cancelDelete} isPending={isPending} itemName={c.title} entityType="legal_case" entityId={c.id} />;
              return null;
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
