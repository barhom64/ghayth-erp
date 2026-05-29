import { useState } from "react";
import { z } from "zod";
import { useLocation } from "wouter";
import { formatDateAr } from "@/lib/formatters";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { GuardedButton } from "@/components/shared/permission-gate";
// Phase A — HR official letters on unified primitives.
import {
  PageShell,
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  FormShell,
  FormTextField,
  FormTextareaField,
  FormSelectField,
  FormGrid,
} from "@workspace/ui-core";
import { Plus, FileText, FileSignature, Send } from "lucide-react";
import { PrintButton } from "@/components/shared/print-button";
import { KpiGrid } from "@/components/shared/kpi-card";
import { useBranchLetterhead } from "@/hooks/use-branch-letterhead";
import { useAuth } from "@/lib/auth";
import { useAppContext } from "@/contexts/app-context";
import { ApprovalActions } from "@workspace/workflow-kit";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { LETTER_TYPES } from "@/lib/hr-type-maps";

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
  const [viewId, setViewId] = useState<number | null>(null);
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["official-letters"], "/hr/official-letters");
  // GET /hr/official-letters/:id — full body fetched lazily for the
  // "تفاصيل" preview. The list endpoint only returns summaries.
  const letterDetailQ = useApiQuery<any>(
    ["official-letter-detail", String(viewId ?? 0)],
    viewId ? `/hr/official-letters/${viewId}` : null,
    { enabled: viewId !== null },
  );
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

  // Inline edit + delete for letters. The backend's PATCH/DELETE on
  // /hr/official-letters/:id refuses edits/deletes on letters past the
  // draft state — the row actions are still shown but the server is
  // authoritative.
  const {
    editingId, deletingId, editForm, setEditForm,
    startEdit, startDelete, cancelEdit, cancelDelete,
    isPending, handleSave, handleDelete,
  } = useInlineActions({
    endpoint: "/hr/official-letters",
    queryKeys: [["official-letters"]],
    onSuccess: () => refetch(),
  });

  // GET /umrah/letters/:id/pdf — letters typed as `umrah_*` use the
  // umrah-print pipeline (different letterhead, multilingual). Opens
  // in a new tab for download/print.
  const handleUmrahPdf = (letter: any) => {
    if (!letter?.id) return;
    window.open(`/api/umrah/letters/${letter.id}/pdf`, "_blank");
  };
  // POST /umrah/letters/:id/dispatch — records that the operator
  // handed the printed letter to the consul/dispatched it externally.
  // The dispatchMethod toggles between in-person delivery and courier
  // pickup so the audit trail is unambiguous.
  const dispatchUmrahLetterMut = useApiMutation<unknown, { id: number; dispatchMethod: string }>(
    (b) => `/umrah/letters/${b.id}/dispatch`,
    "POST",
    [["official-letters"]],
    { successMessage: "تم تسجيل التسليم" },
  );

  const letterEditFields = [
    { key: "subject", label: "الموضوع" },
    { key: "body", label: "النص" },
    { key: "notes", label: "ملاحظات" },
  ];

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
      render: (l) => {
        const isUmrahLetter = typeof l.type === "string" && l.type.startsWith("umrah");
        return (
          <div className="flex gap-1 items-center">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setViewId(l.id)}>
              تفاصيل
            </Button>
            {isUmrahLetter ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleUmrahPdf(l)}
                  title="PDF (مسار العمرة)"
                >
                  PDF
                </Button>
                <GuardedButton
                  perm="umrah:update"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => dispatchUmrahLetterMut.mutate({ id: l.id, dispatchMethod: "in_person" })}
                  disabled={dispatchUmrahLetterMut.isPending || l.status !== "approved"}
                  rateLimitAware
                  title="تسليم الخطاب (تسجيل في السجل)"
                >
                  تسليم
                </GuardedButton>
              </>
            ) : (
              <PrintButton
                entityType="official_letter"
                entityId={l.id}
                formats={["a4"]}
                label=""
                variant="ghost"
                size="sm"
              />
            )}
            <RowActions
              onEdit={() => startEdit(l.id, { subject: l.subject, body: l.body, notes: l.notes })}
              onDelete={() => startDelete(l.id)}
              canEdit={["draft", "rejected"].includes(l.status)}
              canDelete={["draft", "rejected"].includes(l.status)}
              deletePerm="hr:delete"
            />
          </div>
        );
      },
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

      {editingId !== null && (
        <InlineEditForm
          fields={letterEditFields}
          initialValues={editForm}
          onSave={(values) => handleSave(editingId, values)}
          onCancel={cancelEdit}
          isPending={isPending}
        />
      )}

      {deletingId !== null && (
        <InlineDeleteConfirm
          onConfirm={() => handleDelete(deletingId)}
          onCancel={cancelDelete}
          isPending={isPending}
        />
      )}

      <Dialog open={viewId !== null} onOpenChange={(o) => !o && setViewId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{letterDetailQ.data?.subject ?? "تفاصيل الخطاب"}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2 text-sm">
            {letterDetailQ.isLoading ? (
              <p className="text-muted-foreground">جاري التحميل...</p>
            ) : letterDetailQ.data ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><span className="text-muted-foreground">النوع:</span> {LETTER_TYPES[letterDetailQ.data.type] ?? letterDetailQ.data.type}</div>
                  <div><span className="text-muted-foreground">الحالة:</span> <PageStatusBadge status={letterDetailQ.data.status} /></div>
                  <div><span className="text-muted-foreground">الموظف:</span> {letterDetailQ.data.employeeName ?? "-"}</div>
                  <div><span className="text-muted-foreground">التاريخ:</span> {letterDetailQ.data.createdAt ? formatDateAr(letterDetailQ.data.createdAt) : "-"}</div>
                </div>
                {letterDetailQ.data.body && (
                  <div className="border rounded p-3 bg-muted/30 whitespace-pre-wrap text-sm leading-relaxed">
                    {letterDetailQ.data.body}
                  </div>
                )}
                {letterDetailQ.data.notes && (
                  <p className="text-xs text-muted-foreground">ملاحظات: {letterDetailQ.data.notes}</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">لا توجد بيانات</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewId(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
