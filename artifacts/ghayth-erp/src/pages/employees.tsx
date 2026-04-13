import { useState, useEffect } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Link, useLocation } from "wouter";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  Plus,
  Eye,
  ExternalLink,
  Users,
  UserCheck,
  UserX,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Shield,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLES } from "@/lib/constants";
import {
  useInlineActions,
  RowActions,
  InlineEditForm,
  InlineDeleteConfirm,
} from "@/components/inline-actions";
import {
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
} from "@/components/shared/advanced-filters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { useAppContext } from "@/contexts/app-context";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags, useTagFilter, TagFilterSelect } from "@/components/shared/entity-tags";
// Phase A.1 — HR reference domain. This page is the pattern every other
// HR list page will follow: PageShell wraps the body, PageStatusBadge
// replaces the legacy StatusBadge, column presets handle the obvious
// columns, and actions live in a flex row with no nested interactive
// elements (fixes the "<button> inside <button>" DOM warning).
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { textColumn, actionsColumn } from "@/components/data-table-presets";

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
  const { roleLevel, permissions, scopeQueryString } = useAppContext();
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
  const employees = employeesResponse?.data;
  const total = employeesResponse?.total || 0;
  const { tagsList, selectedTag, setSelectedTag, filteredIds: tagFilteredIds } = useTagFilter("employee");
  const preFiltered = applyFilters(employees || [], filters, {
    statusField: "",
    dateField: "",
  });
  const filtered = tagFilteredIds ? preFiltered.filter((e: any) => tagFilteredIds.has(e.id)) : preFiltered;

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

  const columns: DataTableColumn<any>[] = [
    {
      key: "empNumber",
      header: "الرقم الوظيفي",
      sortable: true,
      render: (e) => <span className="font-mono text-sm">{e.empNumber || "-"}</span>,
    },
    {
      key: "name",
      header: "الاسم",
      sortable: true,
      searchable: true,
      render: (e) => (
        <Link
          href={`/employees/${e.id}`}
          className="font-medium text-primary hover:underline"
        >
          {e.name}
        </Link>
      ),
    },
    textColumn("jobTitle", "المسمى الوظيفي"),
    {
      key: "phone",
      header: "رقم الجوال",
      sortable: true,
      ltr: true,
      className: "text-end",
      render: (e) => e.phone || "-",
    },
    {
      key: "role",
      header: "الصلاحية",
      sortable: true,
      render: (e) => ROLES[e.role] || e.role,
    },
    {
      key: "operationalStatus",
      header: "الحالة التشغيلية",
      render: (e) => <OperationalStatusBadge status={operationalStatuses[e.id]} />,
    },
    {
      key: "status",
      header: "حالة الحساب",
      sortable: true,
      render: (e) => <PageStatusBadge status={e.status} />,
    },
    {
      key: "iqama",
      header: "الإقامة",
      render: (e) => (
        <div className="flex flex-col gap-1">
          {e.iqamaExpiry ? (() => {
            const daysLeft = Math.ceil((new Date(e.iqamaExpiry).getTime() - Date.now()) / 86400000);
            return daysLeft <= 0 ? <Badge variant="destructive" className="text-xs gap-1"><Shield className="h-3 w-3" />منتهية</Badge>
              : daysLeft <= 30 ? <Badge className="text-xs gap-1 bg-amber-100 text-amber-700 hover:bg-amber-100"><Shield className="h-3 w-3" />{daysLeft} يوم</Badge>
              : <Badge variant="outline" className="text-xs gap-1 text-green-700"><Shield className="h-3 w-3" />سارية</Badge>;
          })() : <span className="text-xs text-muted-foreground">—</span>}
          {e.govLinkCount > 0 && <Badge variant="secondary" className="text-xs gap-1"><Link2 className="h-3 w-3" />مرتبط ({e.govLinkCount})</Badge>}
        </div>
      ),
    },
    actionsColumn<any>(
      (employee) => (
        // A stopPropagation-wrapped flex row, NOT wrapped in another button.
        // Every child is a discrete interactive element; nothing is nested
        // inside another interactive element. This is what fixes the
        // "validateDOMNesting: <button> cannot appear as descendant of <button>"
        // warning the programmer reported on this page.
        <div
          className="flex items-center gap-1"
          onClick={(ev) => ev.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPreviewItem(employee)}
            title="معاينة سريعة"
          >
            <Eye className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Link href={`/employees/${employee.id}`}>
            <Button variant="ghost" size="icon" title="عرض التفاصيل">
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </Button>
          </Link>
          <RowActions
            canEdit={canManage}
            onEdit={() =>
              startEdit(employee.id, {
                name: employee.name,
                jobTitle: employee.jobTitle,
                phone: employee.phone || "",
                role: employee.role,
                status: employee.status,
              })
            }
            onDelete={() => startDelete(employee.id)}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              setExpandedId(expandedId === employee.id ? null : employee.id)
            }
            title={expandedId === employee.id ? "طي التفاصيل" : "عرض التفاصيل"}
          >
            {expandedId === employee.id ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
      ),
      { header: "الإجراءات", width: "160px" },
    ),
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
    <PageShell
      title="إدارة الموظفين"
      subtitle="قائمة الموظفين والمسميات الوظيفية والحسابات"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        (canWrite || canManage) ? (
          <Link href="/employees/create">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              إضافة موظف
            </Button>
          </Link>
        ) : null
      }
      filters={
        <div className="flex-1 flex flex-col gap-3 w-full">
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
            onExportCSV={() =>
              exportToCSV(
                filtered || [],
                [
                  { key: "empNumber", label: "الرقم الوظيفي" },
                  { key: "name", label: "الاسم" },
                  { key: "jobTitle", label: "المسمى" },
                  { key: "departmentName", label: "القسم" },
                  { key: "branchName", label: "الفرع" },
                  { key: "phone", label: "الجوال" },
                  { key: "status", label: "الحالة" },
                ],
                "الموظفين",
              )
            }
            resultCount={filtered?.length}
          />
          <TagFilterSelect
            tagsList={tagsList}
            selectedTag={selectedTag}
            onSelect={setSelectedTag}
          />
        </div>
      }
    >
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

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        pageSize={pageSize}
        page={page}
        total={total}
        onPageChange={setPage}
        noToolbar
        emptyMessage="لا يوجد موظفين — أضف أول موظف للبدء"
        emptyIcon={<Users className="h-6 w-6 text-slate-400" />}
        emptyAction={{ label: "إضافة موظف جديد", onClick: () => setLocation("/employees/create") }}
        renderRowExtras={(employee) => {
          if (expandedId === employee.id) {
            return (
              <div className="space-y-3 p-2 bg-gray-50/50">
                <EntityTags entityType="employee" entityId={employee.id} />
                <EntityComments entityType="employee" entityId={employee.id} />
              </div>
            );
          }
          if (editingId === employee.id) {
            return (
              <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(employee.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
            );
          }
          if (deletingId === employee.id) {
            return (
              <InlineDeleteConfirm onConfirm={() => handleDelete(employee.id)} onCancel={cancelDelete} isPending={isPending} itemName={employee.name} entityType="employee" entityId={employee.id} />
            );
          }
          return null;
        }}
      />
      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="معاينة الموظف" data={previewItem} fields={previewFields} />
    </PageShell>
  );
}
