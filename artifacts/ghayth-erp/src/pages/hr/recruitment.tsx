import { useState, Fragment } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Briefcase, Users, UserCheck, FileText, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { PaginationBar } from "@/components/data-table-wrapper";
import { useAppContext } from "@/contexts/app-context";

const jobStatusMap: Record<string, { label: string; color: string }> = {
  open: { label: "مفتوح", color: "bg-green-100 text-green-700" },
  closed: { label: "مغلق", color: "bg-red-100 text-red-700" },
  draft: { label: "مسودة", color: "bg-gray-100 text-gray-700" },
};

const stageMap: Record<string, { label: string; color: string }> = {
  new: { label: "جديد", color: "bg-blue-100 text-blue-700" },
  screening: { label: "فرز", color: "bg-yellow-100 text-yellow-700" },
  interview: { label: "مقابلة", color: "bg-purple-100 text-purple-700" },
  offer: { label: "عرض", color: "bg-green-100 text-green-700" },
  hired: { label: "تم التوظيف", color: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "مرفوض", color: "bg-red-100 text-red-700" },
};

export default function RecruitmentPage() {
  const { permissions } = useAppContext();
  const canManage = permissions.canManageEmployees;
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data: jobsData, refetch: refetchJobs } = useApiQuery<any>(["jobs"], "/recruitment/postings");
  const { data: appsData, refetch: refetchApps } = useApiQuery<any>(["applicants"], "/recruitment/applications");
  const { data: stats } = useApiQuery<any>(["recruitment-stats"], "/recruitment/stats");
  const jobs = jobsData?.data || [];
  const apps = appsData?.data || [];
  const filteredJobs = applyFilters(jobs, filters, { searchFields: ["title", "department"], statusField: "status" });
  const filteredApps = applyFilters(apps, filters, { searchFields: ["applicantName", "name"], statusField: "status" });
  const { sortedData: sortedJobs, sortState: jobSortState, handleSort: handleJobSort } = useSortedData(filteredJobs);
  const { sortedData: sortedApps, sortState: appSortState, handleSort: handleAppSort } = useSortedData(filteredApps);

  const kpis = [
    { label: "وظائف مفتوحة", value: stats?.openPostings ?? jobs.filter((j: any) => j.status === "open").length, icon: Briefcase, color: "text-blue-600 bg-blue-50" },
    { label: "إجمالي المتقدمين", value: stats?.totalApplications ?? apps.length, icon: Users, color: "text-green-600 bg-green-50" },
    { label: "طلبات جديدة", value: stats?.newApplications ?? apps.filter((a: any) => a.status === "new").length, icon: FileText, color: "text-yellow-600 bg-yellow-50" },
    { label: "مقابلات مجدولة", value: stats?.scheduledInterviews ?? apps.filter((a: any) => a.status === "interview").length, icon: UserCheck, color: "text-purple-600 bg-purple-50" },
  ];

  const jobActions = useInlineActions({
    endpoint: "/recruitment/postings",
    queryKeys: [["jobs"], ["recruitment-stats"]],
    onSuccess: () => refetchJobs(),
  });

  const jobEditFields = [
    { key: "title", label: "المسمى الوظيفي" },
    { key: "department", label: "القسم" },
    { key: "location", label: "الموقع" },
    { key: "type", label: "النوع" },
    { key: "status", label: "الحالة", type: "select" as const, options: Object.entries(jobStatusMap).map(([k, v]) => ({ value: k, label: v.label })) },
  ];

  const appActions = useInlineActions({
    endpoint: "/recruitment/applications",
    queryKeys: [["applicants"], ["recruitment-stats"]],
    onSuccess: () => refetchApps(),
  });

  const appEditFields = [
    { key: "status", label: "المرحلة", type: "select" as const, options: Object.entries(stageMap).map(([k, v]) => ({ value: k, label: v.label })) },
    { key: "rating", label: "التقييم", type: "number" as const },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">التوظيف والاستقطاب</h1>
        <p className="text-sm text-muted-foreground mt-0.5">إدارة الوظائف المفتوحة وطلبات التوظيف</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm hover:shadow-md transition-shadow">
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Link href="/hr/recruitment/create">
            <Button size="sm"><Plus className="h-4 w-4 me-1" />وظيفة جديدة</Button>
          </Link>
          <Link href="/hr/recruitment/applicants/create">
            <Button size="sm" variant="outline"><Plus className="h-4 w-4 me-1" />إضافة متقدم</Button>
          </Link>
        </div>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث...",
          statuses: [
            ...Object.entries(jobStatusMap).map(([k, v]) => ({ value: k, label: v.label })),
            ...Object.entries(stageMap).map(([k, v]) => ({ value: k, label: v.label })),
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        resultCount={filteredJobs.length + filteredApps.length}
      />

      <Tabs defaultValue="jobs" dir="rtl">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="jobs">الوظائف ({jobs.length})</TabsTrigger>
          <TabsTrigger value="applicants">المتقدمين ({apps.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="jobs">
          <div className="border rounded-lg bg-card overflow-hidden"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <SortableTableHead column="title" label="المسمى الوظيفي" sortState={jobSortState} onSort={handleJobSort} />
                <SortableTableHead column="department" label="القسم" sortState={jobSortState} onSort={handleJobSort} />
                <SortableTableHead column="location" label="الموقع" sortState={jobSortState} onSort={handleJobSort} />
                <SortableTableHead column="type" label="النوع" sortState={jobSortState} onSort={handleJobSort} />
                <SortableTableHead column="applicantsCount" label="المتقدمين" sortState={jobSortState} onSort={handleJobSort} />
                <SortableTableHead column="status" label="الحالة" sortState={jobSortState} onSort={handleJobSort} />
                <th className="p-3 text-start font-medium">إجراءات</th>
              </TableRow></TableHeader>
              <TableBody>
                {(sortedJobs || []).map((j: any) => (
                  <Fragment key={j.id}>
                    <tr className="border-b hover:bg-gray-50 transition-colors">
                      <td className="p-3 font-medium">{j.title}</td>
                      <td className="p-3 text-gray-500">{j.department || "-"}</td>
                      <td className="p-3 text-gray-500">{j.location || "-"}</td>
                      <td className="p-3 text-gray-500">{j.type || "-"}</td>
                      <td className="p-3 font-medium">{j.applicantsCount || apps.filter((a: any) => a.postingId === j.id).length}</td>
                      <td className="p-3"><Badge className={jobStatusMap[j.status]?.color || ""}>{jobStatusMap[j.status]?.label || j.status}</Badge></td>
                      <td className="p-3">
                        <RowActions
                          canEdit={canManage}
                          onEdit={() => jobActions.startEdit(j.id, { title: j.title, department: j.department || "", location: j.location || "", type: j.type || "", status: j.status || "open" })}
                          onDelete={() => jobActions.startDelete(j.id)}
                        />
                      </td>
                    </tr>
                    {jobActions.editingId === j.id && (
                      <tr><td colSpan={7} className="p-2">
                        <InlineEditForm fields={jobEditFields} form={jobActions.editForm} setForm={jobActions.setEditForm} onSave={() => jobActions.handleSave(j.id, jobActions.editForm)} onCancel={jobActions.cancelEdit} isPending={jobActions.isPending} />
                      </td></tr>
                    )}
                    {jobActions.deletingId === j.id && (
                      <tr><td colSpan={7} className="p-2">
                        <InlineDeleteConfirm onConfirm={() => jobActions.handleDelete(j.id)} onCancel={jobActions.cancelDelete} isPending={jobActions.isPending} itemName={j.title} entityType="application" entityId={j.id} />
                      </td></tr>
                    )}
                  </Fragment>
                ))}
                {jobs.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-gray-400">لا توجد وظائف</td></tr>}
              </TableBody>
            </Table>
          </div></div>
        </TabsContent>
        <TabsContent value="applicants">
          <div className="border rounded-lg bg-card overflow-hidden"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <SortableTableHead column="applicantName" label="الاسم" sortState={appSortState} onSort={handleAppSort} />
                <SortableTableHead column="postingTitle" label="المنصب" sortState={appSortState} onSort={handleAppSort} />
                <SortableTableHead column="email" label="البريد" sortState={appSortState} onSort={handleAppSort} />
                <SortableTableHead column="phone" label="الهاتف" sortState={appSortState} onSort={handleAppSort} />
                <SortableTableHead column="rating" label="التقييم" sortState={appSortState} onSort={handleAppSort} />
                <SortableTableHead column="status" label="المرحلة" sortState={appSortState} onSort={handleAppSort} />
                <th className="p-3 text-start font-medium">إجراءات</th>
              </TableRow></TableHeader>
              <TableBody>
                {(sortedApps || []).map((a: any) => (
                  <Fragment key={a.id}>
                    <tr className="border-b hover:bg-gray-50 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold">
                            {(a.applicantName || a.name || "؟").charAt(0)}
                          </div>
                          <span className="font-medium">{a.applicantName || a.name}</span>
                        </div>
                      </td>
                      <td className="p-3 text-gray-500">{a.postingTitle || a.position || "-"}</td>
                      <td className="p-3 text-gray-500">{a.email || "-"}</td>
                      <td className="p-3 text-gray-500">{a.phone || "-"}</td>
                      <td className="p-3">{a.rating ? `${a.rating}/5` : "-"}</td>
                      <td className="p-3"><Badge className={stageMap[a.status || a.stage]?.color || ""}>{stageMap[a.status || a.stage]?.label || a.status || a.stage}</Badge></td>
                      <td className="p-3">
                        <RowActions
                          canEdit={canManage}
                          onEdit={() => appActions.startEdit(a.id, { status: a.status || a.stage || "new", rating: a.rating || 0 })}
                          onDelete={() => appActions.startDelete(a.id)}
                        />
                      </td>
                    </tr>
                    {appActions.editingId === a.id && (
                      <tr><td colSpan={7} className="p-2">
                        <InlineEditForm fields={appEditFields} form={appActions.editForm} setForm={appActions.setEditForm} onSave={() => appActions.handleSave(a.id, appActions.editForm)} onCancel={appActions.cancelEdit} isPending={appActions.isPending} />
                      </td></tr>
                    )}
                    {appActions.deletingId === a.id && (
                      <tr><td colSpan={7} className="p-2">
                        <InlineDeleteConfirm onConfirm={() => appActions.handleDelete(a.id)} onCancel={appActions.cancelDelete} isPending={appActions.isPending} itemName={a.applicantName || a.name} entityType="application" entityId={a.id} />
                      </td></tr>
                    )}
                  </Fragment>
                ))}
                {apps.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-gray-400">لا يوجد متقدمين</td></tr>}
              </TableBody>
            </Table>
          </div></div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
