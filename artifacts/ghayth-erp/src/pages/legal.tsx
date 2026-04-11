import { useState, Fragment } from "react";
import { Link, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTableWrapper, PaginationBar } from "@/components/data-table-wrapper";
import { SortableTableHead } from "@/components/sortable-table-head";
import { useSortedData } from "@/hooks/use-sorted-data";
import { useApiQuery, asList } from "@/lib/api";
import { FileText, Gavel, Plus, Scale, Search, Copy, ExternalLink } from "lucide-react";
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

const CONTRACT_STATUS_OPTIONS = [
  { value: "draft", label: "مسودة" },
  { value: "active", label: "ساري" },
  { value: "expired", label: "منتهي" },
  { value: "terminated", label: "ملغي" },
];

function ContractsTab() {
  const { data: stats } = useApiQuery(["legal-stats"], "/legal/stats");
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
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

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
            onExportCSV={() => exportToCSV(sortedData || [], [
              { key: "title", label: "العنوان" },
              { key: "contractType", label: "النوع" },
              { key: "partyName", label: "الطرف" },
              { key: "startDate", label: "من" },
              { key: "endDate", label: "إلى" },
              { key: "value", label: "القيمة" },
              { key: "status", label: "الحالة" },
            ], "العقود")}
            resultCount={sortedData?.length}
          />
        </div>
        {canManage && <Link href="/legal/create"><Button className="gap-2"><Plus className="h-4 w-4" /> عقد جديد</Button></Link>}
      </div>

      <Card>
        <CardHeader><CardTitle>العقود القانونية</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow>
            <SortableTableHead column="title" label="العنوان" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="contractType" label="النوع" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="partyName" label="الطرف" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="startDate" label="من" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="endDate" label="إلى" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="value" label="القيمة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
            <TableHead className="text-start">الإجراءات</TableHead>
          </TableRow></TableHeader>
          <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filtered} colCount={8} emptyMessage="لا توجد عقود" emptyIcon={<FileText className="h-6 w-6 text-slate-400" />}>
            {sortedData?.map(c => (
              <Fragment key={c.id}>
                <TableRow>
                  <TableCell className="font-medium">{c.title}</TableCell>
                  <TableCell>{c.contractType || "-"}</TableCell>
                  <TableCell>{c.partyName || "-"}</TableCell>
                  <TableCell>{formatDateAr(c.startDate)}</TableCell>
                  <TableCell>{formatDateAr(c.endDate)}</TableCell>
                  <TableCell>{c.value ? formatCurrency(Number(c.value)) : "-"}</TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="text-start">
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
                  </TableCell>
                </TableRow>
                {editingId === c.id && (
                  <TableRow><TableCell colSpan={8}>
                    <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(c.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
                  </TableCell></TableRow>
                )}
                {deletingId === c.id && (
                  <TableRow><TableCell colSpan={8}>
                    <InlineDeleteConfirm onConfirm={() => handleDelete(c.id)} onCancel={cancelDelete} isPending={isPending} itemName={c.title} entityType="legal_contract" entityId={c.id} />
                  </TableCell></TableRow>
                )}
              </Fragment>
            ))}
          </DataTableWrapper></Table>
          <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
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
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

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
            onExportCSV={() => exportToCSV(sortedData || [], [
              { key: "caseNumber", label: "رقم القضية" },
              { key: "title", label: "العنوان" },
              { key: "court", label: "المحكمة" },
              { key: "opposingParty", label: "الخصم" },
              { key: "lawyerName", label: "المحامي" },
              { key: "priority", label: "الأولوية" },
              { key: "status", label: "الحالة" },
            ], "القضايا")}
            resultCount={sortedData?.length}
          />
        </div>
        <Link href="/legal/cases/create"><Button className="gap-2"><Plus className="h-4 w-4" /> قضية جديدة</Button></Link>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Table><TableHeader><TableRow>
            <SortableTableHead column="caseNumber" label="رقم القضية" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="title" label="العنوان" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="court" label="المحكمة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="opposingParty" label="الخصم" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="lawyerName" label="المحامي" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="priority" label="الأولوية" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
            <TableHead className="text-start">الإجراءات</TableHead>
          </TableRow></TableHeader>
          <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filtered} colCount={8} emptyMessage="لا توجد قضايا" emptyIcon={<Scale className="h-6 w-6 text-slate-400" />}>
            {sortedData?.map(c => (
              <Fragment key={c.id}>
                <TableRow>
                  <TableCell className="font-mono">{c.caseNumber || "-"}</TableCell>
                  <TableCell className="font-medium">
                    <button onClick={() => setLocation(`/legal/cases/${c.id}`)} className="hover:underline text-blue-700 flex items-center gap-1">
                      {c.title} <ExternalLink className="h-3 w-3 opacity-50" />
                    </button>
                  </TableCell>
                  <TableCell>{c.court || "-"}</TableCell>
                  <TableCell>{c.opposingParty || "-"}</TableCell>
                  <TableCell>{c.lawyerName || "-"}</TableCell>
                  <TableCell><StatusBadge status={c.priority} /></TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="text-start">
                    <RowActions
                      canEdit={canManage}
                      onEdit={() => startEdit(c.id, { title: c.title, court: c.court || "", opposingParty: c.opposingParty || "", lawyerName: c.lawyerName || "", status: c.status || "open", priority: c.priority || "medium" })}
                      onDelete={() => startDelete(c.id)}
                    />
                  </TableCell>
                </TableRow>
                {editingId === c.id && (
                  <TableRow><TableCell colSpan={8}>
                    <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(c.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
                  </TableCell></TableRow>
                )}
                {deletingId === c.id && (
                  <TableRow><TableCell colSpan={8}>
                    <InlineDeleteConfirm onConfirm={() => handleDelete(c.id)} onCancel={cancelDelete} isPending={isPending} itemName={c.title} entityType="legal_case" entityId={c.id} />
                  </TableCell></TableRow>
                )}
              </Fragment>
            ))}
          </DataTableWrapper></Table>
        </CardContent>
      </Card>
    </div>
  );
}
