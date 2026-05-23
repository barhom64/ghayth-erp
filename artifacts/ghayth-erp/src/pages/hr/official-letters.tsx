import { useState } from "react";
import { z } from "zod";
import { useLocation } from "wouter";
import { formatDateAr } from "@/lib/formatters";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
// Phase A — HR official letters on unified primitives.
import { PageShell } from "@workspace/ui-core";
import { PageStatusBadge } from "@workspace/ui-core";
import { Plus, FileText, FileSignature, Send, Eye } from "lucide-react";
import { KpiGrid } from "@/components/shared/kpi-card";
import { PrintPreviewModal } from "@workspace/report-kit";
import { useBranchLetterhead } from "@/hooks/use-branch-letterhead";
import { useAuth } from "@/lib/auth";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";
import { useAppContext } from "@/contexts/app-context";
import { ApprovalActions } from "@workspace/workflow-kit";
import { AdvancedFilters, useFilters, applyFilters } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { LETTER_TYPES } from "@/lib/hr-type-maps";
import {
  FormShell,
  FormTextField,
  FormTextareaField,
  FormSelectField,
  FormGrid,
} from "@/components/form-shell";

// Old: subject was guarded only by `disabled={!form.subject}`. Schema
// makes it required at validation time + trims whitespace.
// employeeId stays a string so it can be cleanly omitted; the submit
// handler turns it into a number (or null) before sending.
const letterFormSchema = z.object({
  employeeId: z.string(),
  type: z.string().min(1, "النوع مطلوب"),
  subject: z.string().trim().min(1, "الموضوع مطلوب"),
  content: z.string().trim(),
});
type LetterForm = z.infer<typeof letterFormSchema>;
const defaultLetterForm: LetterForm = {
  employeeId: "",
  type: "general",
  subject: "",
  content: "",
};
const LETTER_TYPE_OPTIONS = Object.entries(LETTER_TYPES).map(([value, label]) => ({
  value,
  label: String(label),
}));

export default function OfficialLettersPage() {
  const [, navigate] = useLocation();
  const [showForm, setShowForm] = useState(false);
  const [previewLetter, setPreviewLetter] = useState<any>(null);
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["official-letters"], "/hr/official-letters");
  const items = data?.data || [];
  // HR-U4 — successMessage بدل buildErrorToast اليدوي.
  const createMut = useApiMutation<unknown, Record<string, unknown>>(
    "/hr/official-letters",
    "POST",
    [["official-letters"]],
    { successMessage: "تم إنشاء الخطاب" },
  );
  const { user } = useAuth();
  const branch = useBranchLetterhead(user?.branchId);
  const { roleLevel } = useAppContext();
  const canApprove = roleLevel >= 70;
  const [advFilters, setAdvFilters] = useFilters();

  const filtered = applyFilters(items, advFilters, {
    searchFields: ["subject", "employeeName"] as any,
    statusField: "status" as any,
    dateField: "createdAt" as any,
  });

  const columns: DataTableColumn<any>[] = [
    { key: "subject", header: "الموضوع", sortable: true, className: "font-medium", render: (l) => l.subject },
    { key: "type", header: "النوع", sortable: true, render: (l) => LETTER_TYPES[l.type] || l.type },
    { key: "employeeName", header: "الموظف", sortable: true, className: "text-muted-foreground", render: (l) => l.employeeName || "-" },
    { key: "createdAt", header: "التاريخ", sortable: true, className: "text-muted-foreground", render: (l) => l.createdAt ? formatDateAr(l.createdAt) : "-" },
    { key: "status", header: "الحالة", sortable: true, render: (l) => <PageStatusBadge status={l.status} /> },
    {
      key: "actions",
      header: "إجراءات",
      render: (l) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setPreviewLetter(l)} title="معاينة وطباعة">
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
    {
      key: "approval",
      header: "اعتماد",
      hidden: !canApprove,
      render: (l) => (
        <ApprovalActions
          entityType="official-letter"
          entityId={l.id}
          currentStatus={l.status}
          approveEndpoint={`/hr/official-letters/${l.id}/approve`}
          rejectEndpoint={`/hr/official-letters/${l.id}/approve`}
          returnEndpoint={`/hr/official-letters/${l.id}/approve`}
          approveMethod="PATCH"
          rejectMethod="PATCH"
          returnMethod="PATCH"
          approveBody={() => ({ approved: true })}
          rejectBody={(notes) => ({ approved: false, notes })}
          returnBody={(notes) => ({ approved: null, notes })}
          pendingStatuses={["draft", "pending_approval"]}
          invalidateKeys={[["official-letters"]]}
        />
      ),
    },
  ];


  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="الخطابات الرسمية"
      subtitle="إصدار ومتابعة الخطابات الرسمية للموظفين"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <GuardedButton perm="hr:create" size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 me-1" />{showForm ? "إلغاء" : "خطاب جديد"}
        </GuardedButton>
      }
    >
      <KpiGrid items={[
        { label: "إجمالي الخطابات", value: items.length, icon: FileText, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "مسودة", value: items.filter((l: any) => l.status === "draft").length, icon: FileSignature, color: "text-muted-foreground bg-surface-subtle" },
        { label: "صادر", value: items.filter((l: any) => l.status === "issued").length, icon: Send, color: "text-status-success-foreground bg-status-success-surface" },
        { label: "مرسل", value: items.filter((l: any) => l.status === "sent").length, icon: Send, color: "text-status-info-foreground bg-status-info-surface" },
      ]} />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالموضوع أو الموظف...",
          statuses: [
            { value: "draft", label: "مسودة" },
            { value: "issued", label: "صادر" },
            { value: "sent", label: "مرسل" },
          ],
          showDateRange: true,
        }}
        values={advFilters}
        onChange={setAdvFilters}
      />

      {showForm && (
        <Card className="border-status-info-surface">
          <CardContent className="p-4">
            <FormShell
              schema={letterFormSchema}
              defaultValues={defaultLetterForm}
              submitLabel="حفظ"
              secondaryActions={
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                  إلغاء
                </Button>
              }
              onSubmit={async (values, ctx) => {
                await createMut.mutateAsync({
                  ...values,
                  // employeeId is a string in the form; coerce to number
                  // (or null if blank) before sending to the API. The
                  // old `Number(form.employeeId) || null` worked but
                  // hid that "0" → null was unintentional.
                  employeeId: values.employeeId ? Number(values.employeeId) : null,
                });
                ctx.reset();
                setShowForm(false);
              }}
            >
              <FormGrid cols={2}>
                <FormSelectField name="type" label="النوع" options={LETTER_TYPE_OPTIONS} />
                <FormTextField name="subject" label="الموضوع" required />
                <FormTextareaField name="content" label="المحتوى" rows={6} className="md:col-span-2" />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        noToolbar
        emptyMessage="لا توجد خطابات"
        emptyIcon={<FileText className="h-6 w-6 text-slate-400" />}

      />

      {previewLetter && (
        <PrintPreviewModal
          open={!!previewLetter}
          onClose={() => setPreviewLetter(null)}
          branch={branch}
          documentTitle={LETTER_TYPES[previewLetter.type] || "خطاب رسمي"}
          documentRef={previewLetter.ref || `LTR-${previewLetter.id}`}
          documentDate={previewLetter.createdAt ? formatDateAr(previewLetter.createdAt) : ""}
        >
          <div style={{ marginBottom: "24px" }}>
            <h3 style={{ fontSize: "14pt", fontWeight: "bold", marginBottom: "12px" }}>{previewLetter.subject}</h3>
            {previewLetter.employeeName && (
              <div className="info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
                <div className="info-item" style={{ display: "flex", gap: "4px" }}>
                  <span className="info-label" style={{ color: "#555" }}>الموظف:</span>
                  <span className="info-value" style={{ fontWeight: 600 }}>{previewLetter.employeeName}</span>
                </div>
              </div>
            )}
          </div>

          {previewLetter.content && (
            <div className="letter-body" style={{ whiteSpace: "pre-wrap", lineHeight: 2, fontSize: "12pt", margin: "20px 0" }}>
              {previewLetter.content}
            </div>
          )}

          <div className="signature-area" style={{ marginTop: "60px", display: "flex", justifyContent: "space-between" }}>
            <div className="signature-box" style={{ textAlign: "center", minWidth: "150px" }}>
              <div className="signature-line" style={{ borderTop: "1px solid #333", marginTop: "40px", paddingTop: "4px", fontSize: "9pt" }}>
                توقيع المسؤول
              </div>
            </div>
            <div className="signature-box" style={{ textAlign: "center", minWidth: "150px" }}>
              <div className="signature-line" style={{ borderTop: "1px solid #333", marginTop: "40px", paddingTop: "4px", fontSize: "9pt" }}>
                الختم الرسمي
              </div>
            </div>
          </div>
        </PrintPreviewModal>
      )}
    </PageShell>
  );
}
