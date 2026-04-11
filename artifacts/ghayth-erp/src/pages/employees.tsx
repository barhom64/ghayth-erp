import { useState, Fragment, useEffect } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Link, useLocation } from "wouter";

import { Card, CardContent } from "@/components/ui/card";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { DataTableWrapper, PaginationBar } from "@/components/data-table-wrapper";
import { SortableTableHead } from "@/components/sortable-table-head";
import { useSortedData } from "@/hooks/use-sorted-data";
import { Plus, Eye, ExternalLink, Users, UserCheck, UserX, Briefcase, ChevronDown, ChevronUp, Shield, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLES } from "@/lib/constants";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV, type FilterValues } from "@/components/shared/advanced-filters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { useAppContext } from "@/contexts/app-context";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags, useTagFilter, TagFilterSelect } from "@/components/shared/entity-tags";

const EMP_STATUS_OPTIONS = [
  { value: "active", label: "نشط" },
  { value: "inactive", label: "غير نشط" },
];

type OperationalStatus = {
  status: string;
  label: string;
  color: string;
  reason: string;
};

function OperationalStatusBadge({ status }: { status: OperationalStatus | undefined }) {
  if (!status) return null;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", status.color)}
      title={status.reason || undefined}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {status.label}
    </span>
  );
}

export default function Employees() {
  const [, setLocation] = useLocation();
  const { roleLevel, hasPermission, permissions, scopeQueryString } = useAppContext();
  const canWrite = roleLevel >= 50;
  const canManage = permissions.canManageEmployees;
  const [filters, setFilters] = useFilters();
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const scopeSuffix = scopeQueryString ? `&${scopeQueryString}` : "";
  const { data: employeesResponse, isLoading, isError, error, refetch } = useApiQuery<{ data: any[]; total: number }>(
    ["employees", filters.search, String(page), scopeQueryString],
    `/employees?search=${encodeURIComponent(filters.search)}&page=${page}&limit=${pageSize}${scopeSuffix}`
  );
  const { data: branchesResp } = useApiQuery<any>(["settings-branches"], "/settings/branches");
  const branchOptions = (branchesResp?.data || []).map((b: any) => ({ value: String(b.id), label: b.name }));
  const employees = employeesResponse?.data;
  const total = employeesResponse?.total || 0;
  const { tagsList, selectedTag, setSelectedTag, filteredIds: tagFilteredIds } = useTagFilter("employee");
  const preFiltered = applyFilters(employees || [], filters, {
    statusField: "",
    dateField: "",
  });
  const filtered = tagFilteredIds ? preFiltered.filter((e: any) => tagFilteredIds.has(e.id)) : preFiltered;
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  const [operationalStatuses, setOperationalStatuses] = useState<Record<number, OperationalStatus>>({});

  useEffect(() => {
    if (!employees || employees.length === 0) return;
    apiFetch<{ data: Array<{ employeeId: number } & OperationalStatus> }>("/hr/employees-status")
      .then((resp) => {
        const map: Record<number, OperationalStatus> = {};
        (resp.data || []).forEach((s) => { map[s.employeeId] = s; });
        setOperationalStatuses(map);
      })
      .catch(() => {});
  }, [employees?.length]);

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/employees",
    queryKeys: [["employees", filters.search, String(page)]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "name", label: "الاسم" },
    { key: "jobTitle", label: "المسمى الوظيفي" },
    { key: "phone", label: "رقم الجوال" },
    { key: "role", label: "الصلاحية", type: "select" as const, options: Object.entries(ROLES).map(([k, v]) => ({ value: k, label: v })) },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "active", label: "نشط" }, { value: "inactive", label: "غير نشط" }] },
  ];

  const previewFields: PreviewField[] = [
    { label: "الاسم", key: "name" },
    { label: "الرقم الوظيفي", key: "empNumber" },
    { label: "القسم", key: "departmentName" },
    { label: "المسمى الوظيفي", key: "jobTitle" },
    { label: "رقم الجوال", key: "phone" },
    { label: "البريد الإلكتروني", key: "email" },
    { label: "الحالة", key: "status", type: "status" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight">إدارة الموظفين</h1>
        {(canWrite || canManage) && (
          <Link href="/employees/create">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              إضافة موظف
            </Button>
          </Link>
        )}
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {[
          { label: "إجمالي الموظفين", value: total, icon: Users, color: "text-blue-600 bg-blue-50" },
          { label: "نشطين", value: employees?.filter((e: any) => e.status === "active").length || 0, icon: UserCheck, color: "text-green-600 bg-green-50" },
          { label: "غير نشطين", value: employees?.filter((e: any) => e.status === "inactive").length || 0, icon: UserX, color: "text-red-600 bg-red-50" },
          { label: "المسميات الوظيفية", value: new Set(employees?.map((e: any) => e.jobTitle).filter(Boolean)).size || 0, icon: Briefcase, color: "text-purple-600 bg-purple-50" },
        ].map((c) => (
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

      <div className="flex flex-col gap-4">
        <AdvancedFilters
          config={{
            searchPlaceholder: "بحث بالاسم أو الرقم الوظيفي...",
            statuses: [
              { value: "active", label: "نشط" },
              { value: "inactive", label: "غير نشط" },
            ],
            showDateRange: true,
          }}
          values={filters}
          onChange={setFilters}
          onExportCSV={() => exportToCSV(sortedData || [], [
            { key: "empNumber", label: "الرقم الوظيفي" },
            { key: "name", label: "الاسم" },
            { key: "jobTitle", label: "المسمى" },
            { key: "departmentName", label: "القسم" },
            { key: "branchName", label: "الفرع" },
            { key: "phone", label: "الجوال" },
            { key: "status", label: "الحالة" },
          ], "الموظفين")}
          resultCount={sortedData?.length}
        />
        <TagFilterSelect tagsList={tagsList} selectedTag={selectedTag} onSelect={setSelectedTag} />
      </div>

      <div className="border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead column="empNumber" label="الرقم الوظيفي" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="name" label="الاسم" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="jobTitle" label="المسمى الوظيفي" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="phone" label="رقم الجوال" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="role" label="الصلاحية" sortState={sortState} onSort={handleSort} />
              <TableHead>الحالة التشغيلية</TableHead>
              <SortableTableHead column="status" label="حالة الحساب" sortState={sortState} onSort={handleSort} />
              <TableHead>الإقامة</TableHead>
              <TableHead>الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <DataTableWrapper
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={() => refetch()}
            data={sortedData}
            colCount={9}
            emptyMessage="لا يوجد موظفين — أضف أول موظف للبدء"
            emptyIcon={<Users className="h-6 w-6 text-slate-400" />}
            emptyAction={{ label: "إضافة موظف جديد", onClick: () => setLocation("/employees/create") }}
          >
            {sortedData?.map((employee) => (
              <Fragment key={employee.id}>
                <TableRow>
                  <TableCell className="font-mono text-sm">{employee.empNumber || "-"}</TableCell>
                  <TableCell className="font-medium">{employee.name}</TableCell>
                  <TableCell>{employee.jobTitle}</TableCell>
                  <TableCell dir="ltr" className="text-right">{employee.phone || "-"}</TableCell>
                  <TableCell>{ROLES[employee.role] || employee.role}</TableCell>
                  <TableCell>
                    <OperationalStatusBadge status={operationalStatuses[employee.id]} />
                  </TableCell>
                  <TableCell><StatusBadge status={employee.status} /></TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {employee.iqamaExpiry ? (() => {
                        const daysLeft = Math.ceil((new Date(employee.iqamaExpiry).getTime() - Date.now()) / 86400000);
                        return daysLeft <= 0 ? <Badge variant="destructive" className="text-xs gap-1"><Shield className="h-3 w-3" />منتهية</Badge>
                          : daysLeft <= 30 ? <Badge className="text-xs gap-1 bg-amber-100 text-amber-700 hover:bg-amber-100"><Shield className="h-3 w-3" />{daysLeft} يوم</Badge>
                          : <Badge variant="outline" className="text-xs gap-1 text-green-700"><Shield className="h-3 w-3" />سارية</Badge>;
                      })() : <span className="text-xs text-muted-foreground">—</span>}
                      {employee.govLinkCount > 0 && <Badge variant="secondary" className="text-xs gap-1"><Link2 className="h-3 w-3" />مرتبط ({employee.govLinkCount})</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-start">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setPreviewItem(employee)}><Eye className="h-4 w-4 text-muted-foreground" /></Button>
                      <Link href={`/employees/${employee.id}`}>
                        <Button variant="ghost" size="icon" title="عرض التفاصيل"><ExternalLink className="h-4 w-4 text-muted-foreground" /></Button>
                      </Link>
                      <RowActions
                        canEdit={canManage}
                        onEdit={() => startEdit(employee.id, { name: employee.name, jobTitle: employee.jobTitle, phone: employee.phone || "", role: employee.role, status: employee.status })}
                        onDelete={() => startDelete(employee.id)}
                      />
                      <button onClick={() => setExpandedId(expandedId === employee.id ? null : employee.id)} className="text-gray-400 hover:text-gray-600 p-1">
                        {expandedId === employee.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
                {expandedId === employee.id && (
                  <TableRow key={`expand-${employee.id}`}>
                    <TableCell colSpan={8} className="bg-gray-50/50">
                      <div className="space-y-3 p-2">
                        <EntityTags entityType="employee" entityId={employee.id} />
                        <EntityComments entityType="employee" entityId={employee.id} />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {editingId === employee.id && (
                  <TableRow key={`edit-${employee.id}`}>
                    <TableCell colSpan={8}>
                      <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(employee.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
                    </TableCell>
                  </TableRow>
                )}
                {deletingId === employee.id && (
                  <TableRow key={`del-${employee.id}`}>
                    <TableCell colSpan={8}>
                      <InlineDeleteConfirm onConfirm={() => handleDelete(employee.id)} onCancel={cancelDelete} isPending={isPending} itemName={employee.name} entityType="employee" entityId={employee.id} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </DataTableWrapper>
        </Table>
        <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      </div>
      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="معاينة الموظف" data={previewItem} fields={previewFields} />
    </div>
  );
}
