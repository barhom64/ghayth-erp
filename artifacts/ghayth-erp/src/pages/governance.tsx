import { useState, Fragment } from "react";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTableWrapper } from "@/components/data-table-wrapper";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, FileCheck, AlertTriangle, ClipboardCheck, Plus, Eye, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { formatDateAr } from "@/lib/formatters";
import { useSortedData } from "@/hooks/use-sorted-data";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { SortableTableHead } from "@/components/sortable-table-head";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";

const MODULE_OPTIONS = [
  { value: "hr", label: "الموارد البشرية" },
  { value: "finance", label: "المالية" },
  { value: "fleet", label: "الأسطول" },
  { value: "property", label: "الأملاك" },
  { value: "operations", label: "العمليات" },
  { value: "warehouse", label: "المستودعات" },
  { value: "governance", label: "الحوكمة" },
  { value: "legal", label: "القانونية" },
  { value: "crm", label: "المبيعات" },
  { value: "support", label: "الدعم" },
  { value: "comms", label: "التواصل" },
  { value: "store", label: "المتجر" },
  { value: "marketing", label: "التسويق" },
];

function StatsCards({ stats }: { stats: any }) {
  const cards = [
    { label: "السياسات", value: stats?.totalPolicies || 0, icon: FileCheck, color: "text-blue-600 bg-blue-50" },
    { label: "المخاطر المفتوحة", value: stats?.openRisks || 0, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
    { label: "التدقيق النشط", value: stats?.activeAudits || 0, icon: ClipboardCheck, color: "text-purple-600 bg-purple-50" },
    { label: "عدم الامتثال", value: stats?.nonCompliant || 0, icon: Shield, color: "text-amber-600 bg-amber-50" },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
  const { sortedData: sortedPolicies, sortState: policySortState, handleSort: handlePolicySort } = useSortedData(filteredPolicies);

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
          <Table><TableHeader><TableRow>
            <SortableTableHead column="title" label="العنوان" sortState={policySortState} onSort={handlePolicySort} />
            <SortableTableHead column="category" label="التصنيف" sortState={policySortState} onSort={handlePolicySort} />
            <SortableTableHead column="version" label="الإصدار" sortState={policySortState} onSort={handlePolicySort} />
            <SortableTableHead column="effectiveDate" label="تاريخ النفاذ" sortState={policySortState} onSort={handlePolicySort} />
            <SortableTableHead column="status" label="الحالة" sortState={policySortState} onSort={handlePolicySort} />
            <TableHead>إجراءات</TableHead>
          </TableRow></TableHeader>
          <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filteredPolicies} colCount={6} emptyMessage="لا توجد سياسات" emptyIcon={<FileCheck className="h-6 w-6 text-slate-400" />}>
            {(sortedPolicies || [])?.map((p: any) => (
              <Fragment key={p.id}>
                <TableRow className={cn(editingId === p.id && "bg-muted/50", deletingId === p.id && "bg-destructive/5")}>
                  <TableCell>
                    <div>
                      <span className="font-medium">{p.title}</span>
                      {p.parentId && <Badge variant="outline" className="ms-2 text-[10px]">فرعي</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.category || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      <GitBranch className="w-3 h-3 me-1" />v{p.version || 1}
                    </Badge>
                  </TableCell>
                  <TableCell>{p.effectiveDate ? formatDateAr(p.effectiveDate) : "-"}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setPreviewItem(p)}><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleNewVersion(p.id)} title="إصدار جديد"><GitBranch className="h-4 w-4" /></Button>
                      <RowActions
                        onEdit={() => startEdit(p.id, { title: p.title, category: p.category || "", description: p.description || "", effectiveDate: p.effectiveDate || "", status: p.status || "draft" })}
                        onDelete={() => startDelete(p.id)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
                {editingId === p.id && (
                  <TableRow><TableCell colSpan={6} className="p-2 bg-muted/30">
                    <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(p.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
                  </TableCell></TableRow>
                )}
                {deletingId === p.id && (
                  <TableRow><TableCell colSpan={6} className="p-2 bg-destructive/5">
                    <InlineDeleteConfirm onConfirm={() => handleDelete(p.id)} onCancel={cancelDelete} isPending={isPending} itemName={p.title} entityType="policy" entityId={p.id} />
                  </TableCell></TableRow>
                )}
              </Fragment>
            ))}
          </DataTableWrapper></Table>
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
  const { sortedData: sortedRisks, sortState: riskSortState, handleSort: handleRiskSort } = useSortedData(filteredRisks);

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
          <Table><TableHeader><TableRow>
            <SortableTableHead column="title" label="الخطر" sortState={riskSortState} onSort={handleRiskSort} /><SortableTableHead column="severity" label="الشدة" sortState={riskSortState} onSort={handleRiskSort} /><SortableTableHead column="createdAt" label="التاريخ" sortState={riskSortState} onSort={handleRiskSort} /><SortableTableHead column="status" label="الحالة" sortState={riskSortState} onSort={handleRiskSort} /><TableHead>إجراءات</TableHead>
          </TableRow></TableHeader>
          <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filteredRisks} colCount={5} emptyMessage="لا توجد مخاطر" emptyIcon={<AlertTriangle className="h-6 w-6 text-slate-400" />}>
            {(sortedRisks || [])?.map((r: any) => (
              <Fragment key={r.id}>
                <TableRow className={cn(editingId === r.id && "bg-muted/50", deletingId === r.id && "bg-destructive/5")}>
                  <TableCell className="font-medium">{r.title}</TableCell>
                  <TableCell><StatusBadge status={r.severity} /></TableCell>
                  <TableCell>{formatDateAr(r.createdAt)}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setPreviewRisk(r)}><Eye className="h-4 w-4" /></Button>
                      <RowActions
                        onEdit={() => startEdit(r.id, { title: r.title, severity: r.severity || "medium", status: r.status || "open", description: r.description || "" })}
                        onDelete={() => startDelete(r.id)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
                {editingId === r.id && (
                  <TableRow><TableCell colSpan={5} className="p-2 bg-muted/30">
                    <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(r.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
                  </TableCell></TableRow>
                )}
                {deletingId === r.id && (
                  <TableRow><TableCell colSpan={5} className="p-2 bg-destructive/5">
                    <InlineDeleteConfirm onConfirm={() => handleDelete(r.id)} onCancel={cancelDelete} isPending={isPending} itemName={r.title} entityType="risk" entityId={r.id} />
                  </TableCell></TableRow>
                )}
              </Fragment>
            ))}
          </DataTableWrapper></Table>
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
  const { sortedData: sortedAudits, sortState: auditSortState, handleSort: handleAuditSort } = useSortedData(filteredAudits);

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
          <Table><TableHeader><TableRow>
            <SortableTableHead column="title" label="العنوان" sortState={auditSortState} onSort={handleAuditSort} /><SortableTableHead column="auditorName" label="المدقق" sortState={auditSortState} onSort={handleAuditSort} /><SortableTableHead column="scope" label="النطاق" sortState={auditSortState} onSort={handleAuditSort} /><SortableTableHead column="status" label="الحالة" sortState={auditSortState} onSort={handleAuditSort} /><TableHead>إجراءات</TableHead>
          </TableRow></TableHeader>
          <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filteredAudits} colCount={5} emptyMessage="لا يوجد تدقيق" emptyIcon={<ClipboardCheck className="h-6 w-6 text-slate-400" />}>
            {(sortedAudits || [])?.map((a: any) => (
              <Fragment key={a.id}>
                <TableRow className={cn(editingId === a.id && "bg-muted/50", deletingId === a.id && "bg-destructive/5")}>
                  <TableCell className="font-medium">{a.title}</TableCell>
                  <TableCell className="text-muted-foreground">{a.auditorName || "-"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{a.scope || "-"}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setPreviewAudit(a)}><Eye className="h-4 w-4" /></Button>
                      <RowActions
                        onEdit={() => startEdit(a.id, { title: a.title, auditorName: a.auditorName || "", scope: a.scope || "", status: a.status || "planned" })}
                        onDelete={() => startDelete(a.id)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
                {editingId === a.id && (
                  <TableRow><TableCell colSpan={5} className="p-2 bg-muted/30">
                    <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(a.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
                  </TableCell></TableRow>
                )}
                {deletingId === a.id && (
                  <TableRow><TableCell colSpan={5} className="p-2 bg-destructive/5">
                    <InlineDeleteConfirm onConfirm={() => handleDelete(a.id)} onCancel={cancelDelete} isPending={isPending} itemName={a.title} entityType="audit" entityId={a.id} />
                  </TableCell></TableRow>
                )}
              </Fragment>
            ))}
          </DataTableWrapper></Table>
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
  const { sortedData: sortedCompliance, sortState: compSortState, handleSort: handleCompSort } = useSortedData(filteredCompliance);

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
          <Table><TableHeader><TableRow>
            <SortableTableHead column="regulation" label="اللائحة" sortState={compSortState} onSort={handleCompSort} /><SortableTableHead column="responsiblePerson" label="المسؤول" sortState={compSortState} onSort={handleCompSort} /><SortableTableHead column="createdAt" label="التاريخ" sortState={compSortState} onSort={handleCompSort} /><SortableTableHead column="status" label="الحالة" sortState={compSortState} onSort={handleCompSort} /><TableHead>إجراءات</TableHead>
          </TableRow></TableHeader>
          <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filteredCompliance} colCount={5} emptyMessage="لا توجد بيانات" emptyIcon={<Shield className="h-6 w-6 text-slate-400" />}>
            {(sortedCompliance || [])?.map((item: any) => (
              <Fragment key={item.id}>
                <TableRow className={cn(editingId === item.id && "bg-muted/50", deletingId === item.id && "bg-destructive/5")}>
                  <TableCell className="font-medium">{item.regulation}</TableCell>
                  <TableCell className="text-muted-foreground">{item.responsiblePerson || "-"}</TableCell>
                  <TableCell>{formatDateAr(item.createdAt)}</TableCell>
                  <TableCell><StatusBadge status={item.status} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setPreviewComp(item)}><Eye className="h-4 w-4" /></Button>
                      <RowActions
                        onEdit={() => startEdit(item.id, { regulation: item.regulation, responsiblePerson: item.responsiblePerson || "", description: item.description || "", status: item.status || "compliant" })}
                        onDelete={() => startDelete(item.id)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
                {editingId === item.id && (
                  <TableRow><TableCell colSpan={5} className="p-2 bg-muted/30">
                    <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(item.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
                  </TableCell></TableRow>
                )}
                {deletingId === item.id && (
                  <TableRow><TableCell colSpan={5} className="p-2 bg-destructive/5">
                    <InlineDeleteConfirm onConfirm={() => handleDelete(item.id)} onCancel={cancelDelete} isPending={isPending} itemName={item.regulation} entityType="compliance" entityId={item.id} />
                  </TableCell></TableRow>
                )}
              </Fragment>
            ))}
          </DataTableWrapper></Table>
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewComp} onOpenChange={() => setPreviewComp(null)} title="تفاصيل الامتثال" data={previewComp} fields={compFields} />
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="policies">السياسات</TabsTrigger>
          <TabsTrigger value="risks">المخاطر</TabsTrigger>
          <TabsTrigger value="audits">التدقيق</TabsTrigger>
          <TabsTrigger value="compliance">الامتثال</TabsTrigger>
        </TabsList>
        <TabsContent value="policies"><PoliciesTab /></TabsContent>
        <TabsContent value="risks"><RisksTab /></TabsContent>
        <TabsContent value="audits"><AuditsTab /></TabsContent>
        <TabsContent value="compliance"><ComplianceTab /></TabsContent>
      </Tabs>
    </div>
  );
}
