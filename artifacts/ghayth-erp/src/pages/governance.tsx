import { useState } from "react";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, FileCheck, AlertTriangle, ClipboardCheck, Plus, Eye, GitBranch, CheckCircle2, LayoutDashboard, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { formatDateAr } from "@/lib/formatters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";

function StatsCards({ stats }: { stats: any }) {
  const cards = [
    { label: "السياسات", value: stats?.totalPolicies || 0, icon: FileCheck, color: "text-blue-600 bg-blue-50" },
    { label: "المخاطر المفتوحة", value: stats?.openRisks || 0, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
    { label: "التدقيق النشط", value: stats?.activeAudits || 0, icon: ClipboardCheck, color: "text-purple-600 bg-purple-50" },
    { label: "عدم الامتثال", value: stats?.nonCompliant || 0, icon: Shield, color: "text-amber-600 bg-amber-50" },
    { label: "إجراءات الامتثال", value: stats?.complianceActions || 0, icon: Activity, color: "text-indigo-600 bg-indigo-50" },
    { label: "إجراءات تصحيحية مفتوحة", value: stats?.openCapas || 0, icon: CheckCircle2, color: "text-rose-600 bg-rose-50" },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((c) => (
        <Card key={c.label} className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
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
  );
}

function PoliciesTab() {
  const { data: policiesResp, isLoading, isError, error, refetch } = useApiQuery<any>(["gov-policies"], "/governance/policies");
  const policies = asList(policiesResp);
  const [previewItem, setPreviewItem] = useState<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const [filters, setFilters] = useFilters();
  const policyFields: PreviewField[] = [
    { label: "العنوان", key: "title" },
    { label: "التصنيف", key: "category", type: "badge" },
    { label: "الإصدار", key: "version" },
    { label: "الوصف", key: "description" },
    { label: "تاريخ النفاذ", key: "effectiveDate", type: "date" },
    { label: "تاريخ الانتهاء", key: "expiryDate", type: "date" },
    { label: "التاريخ", key: "createdAt", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];
  const filteredPolicies = applyFilters(policies, filters, { searchFields: ["title", "category"], statusField: "status", dateField: "effectiveDate" });

  const handleNewVersion = async (policyId: number) => {
    try {
      await apiFetch(`/governance/policies/${policyId}/new-version`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      toast({ title: "تم إنشاء إصدار جديد" });
      qc.invalidateQueries({ queryKey: ["gov-policies"] });
    } catch {
      toast({ variant: "destructive", title: "خطأ في إنشاء إصدار جديد" });
    }
  };

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/governance/policies",
    queryKeys: [["gov-policies"], ["gov-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "title", label: "العنوان" },
    { key: "category", label: "التصنيف" },
    { key: "description", label: "الوصف" },
    { key: "effectiveDate", label: "تاريخ النفاذ", type: "date" as const },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "active", label: "نشط" }, { value: "draft", label: "مسودة" }, { value: "archived", label: "مؤرشف" }] },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "title", header: "العنوان", sortable: true,
      render: (p) => (
        <div>
          <span className="font-medium">{p.title}</span>
          {p.parentId && <Badge variant="outline" className="ms-2 text-[10px]">فرعي</Badge>}
        </div>
      ),
    },
    { key: "category", header: "التصنيف", sortable: true, render: (p) => <span className="text-muted-foreground">{p.category || "-"}</span> },
    {
      key: "version", header: "الإصدار", sortable: true,
      render: (p) => (
        <Badge variant="outline" className="text-xs">
          <GitBranch className="w-3 h-3 me-1" />v{p.version || 1}
        </Badge>
      ),
    },
    { key: "effectiveDate", header: "تاريخ النفاذ", sortable: true, render: (p) => p.effectiveDate ? formatDateAr(p.effectiveDate) : "-" },
    { key: "status", header: "الحالة", sortable: true, render: (p) => <StatusBadge status={p.status} /> },
    {
      key: "actions", header: "إجراءات",
      render: (p) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setPreviewItem(p)}><Eye className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => handleNewVersion(p.id)} title="إصدار جديد"><GitBranch className="h-4 w-4" /></Button>
          <RowActions
            onEdit={() => startEdit(p.id, { title: p.title, category: p.category || "", description: p.description || "", effectiveDate: p.effectiveDate || "", status: p.status || "draft" })}
            onDelete={() => startDelete(p.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالعنوان أو التصنيف...",
              statuses: [
                { value: "active", label: "نشط" },
                { value: "draft", label: "مسودة" },
                { value: "archived", label: "مؤرشف" },
              ],
              showDateRange: true,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filteredPolicies, [
              { key: "title", label: "العنوان" },
              { key: "category", label: "التصنيف" },
              { key: "version", label: "الإصدار" },
              { key: "effectiveDate", label: "تاريخ النفاذ" },
              { key: "status", label: "الحالة" },
            ], "policies")}
            resultCount={filteredPolicies.length}
          />
        </div>
        {canWrite && (
          <Link href="/governance/policies/create">
            <Button size="sm"><Plus className="h-4 w-4 me-1" />إضافة سياسة</Button>
          </Link>
        )}
      </div>
      <Card>
        <CardHeader><CardTitle>السياسات</CardTitle></CardHeader>
        <CardContent>
          <DataTable<any>
            columns={columns}
            data={filteredPolicies}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد سياسات"
            emptyIcon={<FileCheck className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
            renderRowExtras={(p) => {
              if (editingId === p.id) return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(p.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === p.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(p.id)} onCancel={cancelDelete} isPending={isPending} itemName={p.title} entityType="policy" entityId={p.id} />;
              return null;
            }}
          />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="تفاصيل السياسة" data={previewItem} fields={policyFields} />
    </div>
  );
}

function RisksTab() {
  const { data: risksResp, isLoading, isError, error, refetch } = useApiQuery<any>(["gov-risks"], "/governance/risks");
  const risks = asList(risksResp);
  const [previewRisk, setPreviewRisk] = useState<any>(null);
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const [filters, setFilters] = useFilters();
  const riskFields: PreviewField[] = [
    { label: "الخطر", key: "title" },
    { label: "الشدة", key: "severity", type: "badge" },
    { label: "الوصف", key: "description" },
    { label: "خطة التخفيف", key: "mitigationPlan" },
    { label: "التاريخ", key: "createdAt", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];
  const filteredRisks = applyFilters(risks, filters, { searchFields: ["title", "description"], statusField: "status", dateField: "createdAt" });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/governance/risks",
    queryKeys: [["gov-risks"], ["gov-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "title", label: "العنوان" },
    { key: "severity", label: "الشدة", type: "select" as const, options: [{ value: "low", label: "منخفض" }, { value: "medium", label: "متوسط" }, { value: "high", label: "عالي" }] },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "open", label: "مفتوح" }, { value: "closed", label: "مغلق" }] },
    { key: "description", label: "الوصف" },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "title", header: "الخطر", sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
    { key: "severity", header: "الشدة", sortable: true, render: (r) => <StatusBadge status={r.severity} /> },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (r) => formatDateAr(r.createdAt) },
    { key: "status", header: "الحالة", sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "actions", header: "إجراءات",
      render: (r) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setPreviewRisk(r)}><Eye className="h-4 w-4" /></Button>
          <RowActions
            onEdit={() => startEdit(r.id, { title: r.title, severity: r.severity || "medium", status: r.status || "open", description: r.description || "" })}
            onDelete={() => startDelete(r.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالخطر أو الوصف...",
              statuses: [
                { value: "open", label: "مفتوح" },
                { value: "closed", label: "مغلق" },
              ],
              showDateRange: true,
              extraFilters: [
                { key: "severity", label: "الشدة", options: [{ value: "low", label: "منخفض" }, { value: "medium", label: "متوسط" }, { value: "high", label: "عالي" }] },
              ],
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filteredRisks, [
              { key: "title", label: "الخطر" },
              { key: "severity", label: "الشدة" },
              { key: "status", label: "الحالة" },
              { key: "createdAt", label: "التاريخ" },
            ], "risks")}
            resultCount={filteredRisks.length}
          />
        </div>
        {canWrite && (
          <Link href="/governance/risks/create">
            <Button size="sm"><Plus className="h-4 w-4 me-1" />إضافة خطر</Button>
          </Link>
        )}
      </div>
      <Card>
        <CardHeader><CardTitle>المخاطر</CardTitle></CardHeader>
        <CardContent>
          <DataTable<any>
            columns={columns}
            data={filteredRisks}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد مخاطر"
            emptyIcon={<AlertTriangle className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
            renderRowExtras={(r) => {
              if (editingId === r.id) return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(r.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === r.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(r.id)} onCancel={cancelDelete} isPending={isPending} itemName={r.title} entityType="risk" entityId={r.id} />;
              return null;
            }}
          />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewRisk} onOpenChange={() => setPreviewRisk(null)} title="تفاصيل الخطر" data={previewRisk} fields={riskFields} />
    </div>
  );
}

function AuditsTab() {
  const { data: auditsResp, isLoading, isError, error, refetch } = useApiQuery<any>(["gov-audits"], "/governance/audits");
  const audits = asList(auditsResp);
  const [previewAudit, setPreviewAudit] = useState<any>(null);
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const [filters, setFilters] = useFilters();
  const auditFields: PreviewField[] = [
    { label: "العنوان", key: "title" },
    { label: "المدقق", key: "auditorName" },
    { label: "النطاق", key: "scope" },
    { label: "النتائج", key: "findings" },
    { label: "التاريخ", key: "createdAt", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];
  const filteredAudits = applyFilters(audits, filters, { searchFields: ["title", "auditorName"], statusField: "status", dateField: "createdAt" });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/governance/audits",
    queryKeys: [["gov-audits"], ["gov-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "title", label: "العنوان" },
    { key: "auditorName", label: "المدقق" },
    { key: "scope", label: "النطاق" },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "planned", label: "مخطط" }, { value: "in_progress", label: "جاري" }, { value: "completed", label: "مكتمل" }] },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "title", header: "العنوان", sortable: true, render: (a) => <span className="font-medium">{a.title}</span> },
    { key: "auditorName", header: "المدقق", sortable: true, render: (a) => <span className="text-muted-foreground">{a.auditorName || "-"}</span> },
    { key: "scope", header: "النطاق", sortable: true, render: (a) => <span className="max-w-[200px] truncate inline-block">{a.scope || "-"}</span> },
    { key: "status", header: "الحالة", sortable: true, render: (a) => <StatusBadge status={a.status} /> },
    {
      key: "actions", header: "إجراءات",
      render: (a) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setPreviewAudit(a)}><Eye className="h-4 w-4" /></Button>
          <RowActions
            onEdit={() => startEdit(a.id, { title: a.title, auditorName: a.auditorName || "", scope: a.scope || "", status: a.status || "planned" })}
            onDelete={() => startDelete(a.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالعنوان أو المدقق...",
              statuses: [
                { value: "planned", label: "مخطط" },
                { value: "in_progress", label: "جاري" },
                { value: "completed", label: "مكتمل" },
              ],
              showDateRange: true,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filteredAudits, [
              { key: "title", label: "العنوان" },
              { key: "auditorName", label: "المدقق" },
              { key: "scope", label: "النطاق" },
              { key: "status", label: "الحالة" },
            ], "audits")}
            resultCount={filteredAudits.length}
          />
        </div>
        {canWrite && (
          <Link href="/governance/audits/create">
            <Button size="sm"><Plus className="h-4 w-4 me-1" />إضافة تدقيق</Button>
          </Link>
        )}
      </div>
      <Card>
        <CardHeader><CardTitle>التدقيق</CardTitle></CardHeader>
        <CardContent>
          <DataTable<any>
            columns={columns}
            data={filteredAudits}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا يوجد تدقيق"
            emptyIcon={<ClipboardCheck className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
            renderRowExtras={(a) => {
              if (editingId === a.id) return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(a.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === a.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(a.id)} onCancel={cancelDelete} isPending={isPending} itemName={a.title} entityType="audit" entityId={a.id} />;
              return null;
            }}
          />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewAudit} onOpenChange={() => setPreviewAudit(null)} title="تفاصيل التدقيق" data={previewAudit} fields={auditFields} />
    </div>
  );
}

function ComplianceTab() {
  const { data: complianceResp, isLoading, isError, error, refetch } = useApiQuery<any>(["gov-compliance"], "/governance/compliance");
  const items = asList(complianceResp);
  const [previewComp, setPreviewComp] = useState<any>(null);
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const [filters, setFilters] = useFilters();
  const compFields: PreviewField[] = [
    { label: "اللائحة", key: "regulation" },
    { label: "المسؤول", key: "responsiblePerson" },
    { label: "الوصف", key: "description" },
    { label: "التاريخ", key: "createdAt", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];
  const filteredCompliance = applyFilters(items, filters, { searchFields: ["regulation", "responsiblePerson"], statusField: "status", dateField: "createdAt" });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/governance/compliance",
    queryKeys: [["gov-compliance"], ["gov-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "regulation", label: "اللائحة/النظام" },
    { key: "responsiblePerson", label: "المسؤول" },
    { key: "description", label: "الوصف" },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "compliant", label: "ممتثل" }, { value: "non_compliant", label: "غير ممتثل" }, { value: "partial", label: "جزئي" }] },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "regulation", header: "اللائحة", sortable: true, render: (i) => <span className="font-medium">{i.regulation}</span> },
    { key: "responsiblePerson", header: "المسؤول", sortable: true, render: (i) => <span className="text-muted-foreground">{i.responsiblePerson || "-"}</span> },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (i) => formatDateAr(i.createdAt) },
    { key: "status", header: "الحالة", sortable: true, render: (i) => <StatusBadge status={i.status} /> },
    {
      key: "actions", header: "إجراءات",
      render: (i) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setPreviewComp(i)}><Eye className="h-4 w-4" /></Button>
          <RowActions
            onEdit={() => startEdit(i.id, { regulation: i.regulation, responsiblePerson: i.responsiblePerson || "", description: i.description || "", status: i.status || "compliant" })}
            onDelete={() => startDelete(i.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث باللائحة أو المسؤول...",
              statuses: [
                { value: "compliant", label: "ممتثل" },
                { value: "non_compliant", label: "غير ممتثل" },
                { value: "partial", label: "جزئي" },
              ],
              showDateRange: true,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filteredCompliance, [
              { key: "regulation", label: "اللائحة" },
              { key: "responsiblePerson", label: "المسؤول" },
              { key: "status", label: "الحالة" },
              { key: "createdAt", label: "التاريخ" },
            ], "compliance")}
            resultCount={filteredCompliance.length}
          />
        </div>
        {canWrite && (
          <Link href="/governance/compliance/create">
            <Button size="sm"><Plus className="h-4 w-4 me-1" />إضافة</Button>
          </Link>
        )}
      </div>
      <Card>
        <CardHeader><CardTitle>الامتثال</CardTitle></CardHeader>
        <CardContent>
          <DataTable<any>
            columns={columns}
            data={filteredCompliance}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد بيانات"
            emptyIcon={<Shield className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
            renderRowExtras={(i) => {
              if (editingId === i.id) return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(i.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === i.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(i.id)} onCancel={cancelDelete} isPending={isPending} itemName={i.regulation} entityType="compliance" entityId={i.id} />;
              return null;
            }}
          />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewComp} onOpenChange={() => setPreviewComp(null)} title="تفاصيل الامتثال" data={previewComp} fields={compFields} />
    </div>
  );
}

function ComplianceDashboardTab() {
  const { data: dashResp, isLoading } = useApiQuery<any>(["gov-compliance-dashboard"], "/governance/compliance-dashboard");
  const dash = dashResp || {};
  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="h-32 bg-gray-100 rounded animate-pulse" />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-0 shadow-sm"><CardContent className="p-4"><p className="text-2xl font-bold text-green-600">{dash.compliant || 0}</p><p className="text-xs text-gray-500">ممتثل</p></CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4"><p className="text-2xl font-bold text-red-600">{dash.nonCompliant || 0}</p><p className="text-xs text-gray-500">غير ممتثل</p></CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4"><p className="text-2xl font-bold text-amber-600">{dash.partial || 0}</p><p className="text-xs text-gray-500">جزئي</p></CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4"><p className="text-2xl font-bold text-blue-600">{dash.complianceRate || 0}%</p><p className="text-xs text-gray-500">معدل الامتثال</p></CardContent></Card>
          </div>
          {(dash.byModule || []).length > 0 && (
            <Card>
              <CardHeader><CardTitle>الامتثال حسب الوحدة</CardTitle></CardHeader>
              <CardContent>
                <DataTable<any>
                  columns={[
                    { key: "module", header: "الوحدة", sortable: true, searchable: true, render: (m) => <span className="font-medium">{m.module}</span> },
                    { key: "compliant", header: "ممتثل", sortable: true, render: (m) => <span className="text-green-700">{m.compliant}</span> },
                    { key: "nonCompliant", header: "غير ممتثل", sortable: true, render: (m) => <span className="text-red-700">{m.nonCompliant}</span> },
                    { key: "partial", header: "جزئي", sortable: true, render: (m) => <span className="text-amber-700">{m.partial}</span> },
                    {
                      key: "rate", header: "معدل الامتثال", sortable: true,
                      render: (m) => (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full">
                            <div className="h-2 bg-green-500 rounded-full" style={{ width: `${m.rate || 0}%` }} />
                          </div>
                          <span className="text-xs text-gray-600 w-8">{m.rate}%</span>
                        </div>
                      ),
                    },
                  ]}
                  data={dash.byModule || []}
                  rowKey={(m) => m.module}
                  noToolbar
                  pageSize={0}
                />
              </CardContent>
            </Card>
          )}
          {(dash.overdueActions || []).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-red-600">إجراءات امتثال متأخرة</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(dash.overdueActions || []).map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between p-2 bg-red-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium">{a.title}</p>
                        <p className="text-xs text-muted-foreground">{a.regulation} — {a.owner}</p>
                      </div>
                      <Badge variant="destructive" className="text-xs">{formatDateAr(a.dueDate)}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ComplianceActionsTab() {
  const { data: actionsResp, isLoading, isError, error, refetch } = useApiQuery<any>(["gov-compliance-actions"], "/governance/compliance-actions");
  const items = asList(actionsResp);
  const [filters, setFilters] = useFilters();
  const [previewItem, setPreviewItem] = useState<any>(null);
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const { toast } = useToast();
  const qc = useQueryClient();

  const filteredItems = applyFilters(items, filters, { searchFields: ["title", "regulation", "owner"], statusField: "status", dateField: "dueDate" });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/governance/compliance-actions",
    queryKeys: [["gov-compliance-actions"], ["gov-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "title", label: "العنوان" },
    { key: "regulation", label: "اللائحة" },
    { key: "owner", label: "المسؤول" },
    { key: "dueDate", label: "تاريخ الاستحقاق", type: "date" as const },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "open", label: "مفتوح" }, { value: "in_progress", label: "جاري" }, { value: "done", label: "منجز" }, { value: "overdue", label: "متأخر" }] },
  ];

  const [newForm, setNewForm] = useState({ title: "", regulation: "", owner: "", dueDate: "", description: "", status: "open" });
  const [showNew, setShowNew] = useState(false);
  const handleCreate = async () => {
    if (!newForm.title) return;
    try {
      await import("@/lib/api").then(({ apiFetch }) => apiFetch("/governance/compliance-actions", {
        method: "POST",
        body: JSON.stringify(newForm),
      }));
      toast({ title: "تم إنشاء الإجراء" });
      setShowNew(false);
      setNewForm({ title: "", regulation: "", owner: "", dueDate: "", description: "", status: "open" });
      qc.invalidateQueries({ queryKey: ["gov-compliance-actions"] });
    } catch { toast({ variant: "destructive", title: "خطأ في الحفظ" }); }
  };

  const previewFields: PreviewField[] = [
    { label: "العنوان", key: "title" },
    { label: "اللائحة", key: "regulation" },
    { label: "المسؤول", key: "owner" },
    { label: "الوصف", key: "description" },
    { label: "تاريخ الاستحقاق", key: "dueDate", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters config={{ searchPlaceholder: "بحث بالإجراء أو اللائحة...", statuses: [{ value: "open", label: "مفتوح" }, { value: "in_progress", label: "جاري" }, { value: "done", label: "منجز" }, { value: "overdue", label: "متأخر" }], showDateRange: true }} values={filters} onChange={setFilters} resultCount={filteredItems.length} />
        </div>
        {canWrite && <Button size="sm" onClick={() => setShowNew(!showNew)}><Plus className="h-4 w-4 me-1" />إجراء جديد</Button>}
      </div>
      {showNew && (
        <Card className="border-dashed">
          <CardContent className="p-4 grid grid-cols-2 gap-3">
            {editFields.map(f => (
              <div key={f.key}>
                <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                {f.type === "select" ? (
                  <select className="w-full border rounded px-2 py-1 text-sm" value={(newForm as any)[f.key]} onChange={e => setNewForm(p => ({ ...p, [f.key]: e.target.value }))}>
                    {f.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input type={f.type === "date" ? "date" : "text"} className="w-full border rounded px-2 py-1 text-sm" value={(newForm as any)[f.key]} onChange={e => setNewForm(p => ({ ...p, [f.key]: e.target.value }))} />
                )}
              </div>
            ))}
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">الوصف</label>
              <textarea className="w-full border rounded px-2 py-1 text-sm" rows={2} value={newForm.description} onChange={e => setNewForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="col-span-2 flex gap-2">
              <Button size="sm" onClick={handleCreate}>حفظ</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>إجراءات الامتثال</CardTitle></CardHeader>
        <CardContent>
          <DataTable<any>
            columns={[
              { key: "title", header: "الإجراء", sortable: true, searchable: true, render: (item) => <span className="font-medium">{item.title}</span> },
              { key: "regulation", header: "اللائحة", sortable: true, searchable: true, render: (item) => <span className="text-muted-foreground">{item.regulation || "-"}</span> },
              { key: "owner", header: "المسؤول", sortable: true, searchable: true, render: (item) => <span>{item.owner || "-"}</span> },
              { key: "dueDate", header: "تاريخ الاستحقاق", sortable: true, render: (item) => item.dueDate ? formatDateAr(item.dueDate) : "-" },
              { key: "status", header: "الحالة", sortable: true, render: (item) => <StatusBadge status={item.status} /> },
              {
                key: "actions", header: "إجراءات",
                render: (item) => (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setPreviewItem(item)}><Eye className="h-4 w-4" /></Button>
                    <RowActions onEdit={() => startEdit(item.id, { title: item.title, regulation: item.regulation || "", owner: item.owner || "", dueDate: item.dueDate || "", status: item.status || "open" })} onDelete={() => startDelete(item.id)} />
                  </div>
                ),
              },
            ]}
            data={filteredItems}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد إجراءات"
            emptyIcon={<Activity className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
            rowClassName={(item) => cn(editingId === item.id && "bg-muted/50", deletingId === item.id && "bg-destructive/5")}
            renderRowExtras={(item) => {
              if (editingId === item.id) return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(item.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === item.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(item.id)} onCancel={cancelDelete} isPending={isPending} itemName={item.title} entityType="compliance-action" entityId={item.id} />;
              return null;
            }}
          />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="تفاصيل الإجراء" data={previewItem} fields={previewFields} />
    </div>
  );
}

function CAPATab() {
  const { data: capaResp, isLoading, isError, error, refetch } = useApiQuery<any>(["gov-capa"], "/governance/capa");
  const items = asList(capaResp);
  const [filters, setFilters] = useFilters();
  const [previewItem, setPreviewItem] = useState<any>(null);
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const { toast } = useToast();
  const qc = useQueryClient();

  const filteredItems = applyFilters(items, filters, { searchFields: ["finding", "rootCause", "responsiblePerson"], statusField: "status", dateField: "dueDate" });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/governance/capa",
    queryKeys: [["gov-capa"], ["gov-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "finding", label: "الملاحظة" },
    { key: "responsiblePerson", label: "المسؤول" },
    { key: "dueDate", label: "تاريخ الاستحقاق", type: "date" as const },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "open", label: "مفتوح" }, { value: "in_progress", label: "جاري" }, { value: "closed", label: "مغلق" }, { value: "overdue", label: "متأخر" }] },
  ];

  const [newForm, setNewForm] = useState({ finding: "", rootCause: "", correctiveAction: "", preventiveAction: "", responsiblePerson: "", dueDate: "", status: "open" });
  const [showNew, setShowNew] = useState(false);
  const handleCreate = async () => {
    if (!newForm.finding) return;
    try {
      await import("@/lib/api").then(({ apiFetch }) => apiFetch("/governance/capa", {
        method: "POST",
        body: JSON.stringify(newForm),
      }));
      toast({ title: "تم إنشاء الإجراء التصحيحي" });
      setShowNew(false);
      setNewForm({ finding: "", rootCause: "", correctiveAction: "", preventiveAction: "", responsiblePerson: "", dueDate: "", status: "open" });
      qc.invalidateQueries({ queryKey: ["gov-capa"] });
    } catch { toast({ variant: "destructive", title: "خطأ في الحفظ" }); }
  };

  const previewFields: PreviewField[] = [
    { label: "الملاحظة", key: "finding" },
    { label: "السبب الجذري", key: "rootCause" },
    { label: "الإجراء التصحيحي", key: "correctiveAction" },
    { label: "الإجراء الوقائي", key: "preventiveAction" },
    { label: "المسؤول", key: "responsiblePerson" },
    { label: "تاريخ الاستحقاق", key: "dueDate", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters config={{ searchPlaceholder: "بحث بالإجراءات التصحيحية...", statuses: [{ value: "open", label: "مفتوح" }, { value: "in_progress", label: "جاري" }, { value: "closed", label: "مغلق" }, { value: "overdue", label: "متأخر" }], showDateRange: true }} values={filters} onChange={setFilters} resultCount={filteredItems.length} />
        </div>
        {canWrite && <Button size="sm" onClick={() => setShowNew(!showNew)}><Plus className="h-4 w-4 me-1" />إجراء تصحيحي جديد</Button>}
      </div>
      {showNew && (
        <Card className="border-dashed">
          <CardContent className="p-4 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">الملاحظة *</label>
              <input className="w-full border rounded px-2 py-1 text-sm" value={newForm.finding} onChange={e => setNewForm(p => ({ ...p, finding: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">المسؤول</label>
              <input className="w-full border rounded px-2 py-1 text-sm" value={newForm.responsiblePerson} onChange={e => setNewForm(p => ({ ...p, responsiblePerson: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">تاريخ الاستحقاق</label>
              <input type="date" className="w-full border rounded px-2 py-1 text-sm" value={newForm.dueDate} onChange={e => setNewForm(p => ({ ...p, dueDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">السبب الجذري</label>
              <textarea className="w-full border rounded px-2 py-1 text-sm" rows={2} value={newForm.rootCause} onChange={e => setNewForm(p => ({ ...p, rootCause: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">الإجراء التصحيحي</label>
              <textarea className="w-full border rounded px-2 py-1 text-sm" rows={2} value={newForm.correctiveAction} onChange={e => setNewForm(p => ({ ...p, correctiveAction: e.target.value }))} />
            </div>
            <div className="col-span-2 flex gap-2">
              <Button size="sm" onClick={handleCreate}>حفظ</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>الإجراءات التصحيحية والوقائية</CardTitle></CardHeader>
        <CardContent>
          <DataTable<any>
            columns={[
              { key: "finding", header: "الملاحظة", sortable: true, searchable: true, render: (item) => <span className="font-medium max-w-[200px] truncate inline-block">{item.finding}</span> },
              { key: "responsiblePerson", header: "المسؤول", sortable: true, searchable: true, render: (item) => <span>{item.responsiblePerson || "-"}</span> },
              { key: "dueDate", header: "الاستحقاق", sortable: true, render: (item) => item.dueDate ? formatDateAr(item.dueDate) : "-" },
              { key: "status", header: "الحالة", sortable: true, render: (item) => <StatusBadge status={item.status} /> },
              {
                key: "actions", header: "إجراءات",
                render: (item) => (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setPreviewItem(item)}><Eye className="h-4 w-4" /></Button>
                    <RowActions onEdit={() => startEdit(item.id, { finding: item.finding, responsiblePerson: item.responsiblePerson || "", dueDate: item.dueDate || "", status: item.status || "open" })} onDelete={() => startDelete(item.id)} />
                  </div>
                ),
              },
            ]}
            data={filteredItems}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد إجراءات تصحيحية"
            emptyIcon={<CheckCircle2 className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
            rowClassName={(item) => cn(editingId === item.id && "bg-muted/50", deletingId === item.id && "bg-destructive/5")}
            renderRowExtras={(item) => {
              if (editingId === item.id) return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(item.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === item.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(item.id)} onCancel={cancelDelete} isPending={isPending} itemName={item.finding} entityType="capa" entityId={item.id} />;
              return null;
            }}
          />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="تفاصيل الإجراء التصحيحي" data={previewItem} fields={previewFields} />
    </div>
  );
}

export default function GovernancePage() {
  const { data: stats } = useApiQuery<any>(["gov-stats"], "/governance/stats");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">الحوكمة والامتثال</h1>
        <p className="text-sm text-muted-foreground mt-0.5">إدارة السياسات والمخاطر والتدقيق والامتثال</p>
      </div>
      <StatsCards stats={stats} />
      <Tabs defaultValue="policies" dir="rtl">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="policies"><FileCheck className="h-4 w-4 me-1" />السياسات</TabsTrigger>
          <TabsTrigger value="risks"><AlertTriangle className="h-4 w-4 me-1" />المخاطر</TabsTrigger>
          <TabsTrigger value="audits"><ClipboardCheck className="h-4 w-4 me-1" />التدقيق</TabsTrigger>
          <TabsTrigger value="compliance"><Shield className="h-4 w-4 me-1" />الامتثال</TabsTrigger>
          <TabsTrigger value="actions"><Activity className="h-4 w-4 me-1" />الإجراءات</TabsTrigger>
          <TabsTrigger value="capa"><CheckCircle2 className="h-4 w-4 me-1" />الإجراءات التصحيحية والوقائية</TabsTrigger>
        </TabsList>
        <TabsContent value="policies"><PoliciesTab /></TabsContent>
        <TabsContent value="risks"><RisksTab /></TabsContent>
        <TabsContent value="audits"><AuditsTab /></TabsContent>
        <TabsContent value="compliance">
          <div className="space-y-6">
            <ComplianceDashboardTab />
            <ComplianceTab />
          </div>
        </TabsContent>
        <TabsContent value="actions"><ComplianceActionsTab /></TabsContent>
        <TabsContent value="capa"><CAPATab /></TabsContent>
      </Tabs>
    </div>
  );
}
