import { useState } from "react";
import { z } from "zod";
import { useFieldArray, useFormContext } from "react-hook-form";
import { useApiQuery, useApiMutation } from "@/lib/api";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  FormShell,
  FormTextField,
  FormSelectField,
  FormTextareaField,
  FormGrid,
} from "@workspace/ui-core";
import { GuardedButton } from "@/components/shared/permission-gate";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { PageStateWrapper } from "@/components/shared/page-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, FileText, X } from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";

/**
 * Finance / Journal Templates — list + create + edit + delete.
 *
 * Phase D / Finance gap #2. Closes 4 unused-backend endpoints:
 *   GET    /finance/journal-templates
 *   POST   /finance/journal-templates
 *   PUT    /finance/journal-templates/:id
 *   DELETE /finance/journal-templates/:id
 *
 * Why this matters: every recurring journal-entry shape (rent
 * accrual, prepaid release, depreciation flip, etc.) was hand-coded
 * inside the journal-create form until now. Templates let an
 * accountant define the debit/credit accounts once and have the
 * journal-entry creation flow auto-fill the lines. The backend has
 * had `journal_entry_templates` + `journal_entry_template_lines`
 * tables since the accounting-engine work landed; the UI never
 * shipped, so the table stayed empty.
 *
 * The lines sub-form uses useFieldArray so accountants can add and
 * remove rows without a save round-trip — the whole template+lines
 * payload posts as a single body.
 */

interface JournalTemplate {
  id: number;
  name: string;
  operationType: string;
  description: string | null;
  branchId: number | null;
  activityType: string | null;
  isActive: boolean;
  lineCount?: number;
  // The list endpoint joins template lines onto each row, so the
  // edit dialog can hydrate from `initial.lines` directly without a
  // second GET /journal-templates/:id round-trip (the backend doesn't
  // expose that detail route — only PUT and DELETE on /:id).
  lines?: JournalTemplateLine[];
}

interface JournalTemplateLine {
  accountId: number | null;
  accountCode: string | null;
  lineType: "debit" | "credit";
  description: string | null;
}

const OPERATION_TYPE_OPTIONS = [
  { value: "invoice", label: "فاتورة بيع" },
  { value: "purchase", label: "فاتورة شراء" },
  { value: "expense", label: "مصروف" },
  { value: "payment", label: "دفعة" },
  { value: "receipt", label: "قبض" },
  { value: "payroll", label: "رواتب" },
  { value: "depreciation", label: "إهلاك" },
  { value: "accrual", label: "استحقاق" },
  { value: "other", label: "أخرى" },
];

const OPERATION_LABEL: Record<string, string> = Object.fromEntries(
  OPERATION_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

const lineSchema = z.object({
  accountCode: z.string().min(1, "اختر الحساب"),
  lineType: z.enum(["debit", "credit"]),
  description: z.string().optional(),
});

const templateSchema = z.object({
  name: z.string().trim().min(1, "اسم القالب مطلوب"),
  operationType: z.string().min(1, "نوع العملية مطلوب"),
  description: z.string().optional(),
  activityType: z.string().optional(),
  lines: z.array(lineSchema).min(1, "يجب إضافة سطر واحد على الأقل"),
});
type TemplateForm = z.infer<typeof templateSchema>;

const EMPTY_DEFAULTS: TemplateForm = {
  name: "",
  operationType: "invoice",
  description: "",
  activityType: "",
  lines: [{ accountCode: "", lineType: "debit", description: "" }],
};

export default function JournalTemplatesPage() {
  const { data, isLoading, error, refetch } = useApiQuery<{ data: JournalTemplate[] }>(
    ["finance-journal-templates"],
    "/finance/journal-templates",
  );
  const rows: JournalTemplate[] = data?.data ?? [];
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<JournalTemplate | null>(null);
  const [deleting, setDeleting] = useState<JournalTemplate | null>(null);

  const columns: DataTableColumn<JournalTemplate>[] = [
    { key: "name", header: "الاسم", className: "font-medium" },
    {
      key: "operationType",
      header: "نوع العملية",
      render: (r) => (
        <Badge variant="outline">{OPERATION_LABEL[r.operationType] ?? r.operationType}</Badge>
      ),
    },
    {
      key: "activityType",
      header: "النشاط",
      render: (r) =>
        r.activityType ? (
          <span className="text-sm text-muted-foreground">{r.activityType}</span>
        ) : (
          "—"
        ),
    },
    {
      key: "description",
      header: "الوصف",
      render: (r) =>
        r.description ? (
          <span className="text-sm text-muted-foreground truncate max-w-xs block">
            {r.description}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "isActive",
      header: "الحالة",
      render: (r) => (
        <Badge variant={r.isActive ? "default" : "secondary"}>
          {r.isActive ? "نشط" : "متوقف"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex gap-1 justify-end">
          <GuardedButton
            perm="finance.accounting_engine:create"
            size="sm"
            variant="ghost"
            onClick={() => setEditing(r)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </GuardedButton>
          <GuardedButton
            perm="finance.accounting_engine:delete"
            size="sm"
            variant="ghost"
            className="text-status-error-foreground"
            onClick={() => setDeleting(r)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </GuardedButton>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="قوالب القيود المحاسبية"
      subtitle="تعريف الحسابات الافتراضية لكل نوع عملية — تختصر تعبئة القيود اليدوية المتكررة"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "قوالب القيود" }]}
      actions={
        <>
          <GuardedButton
            perm="finance.accounting_engine:create"
            onClick={() => setCreating(true)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" /> قالب جديد
          </GuardedButton>
          <PrintButton
            entityType="report_finance_journal_templates"
            entityId="list"
            size="icon"
            payload={{
              entity: { title: "قوالب القيود المحاسبية", total: rows.length },
              items: rows.map((r) => ({
                "الاسم": r.name || "—",
                "نوع العملية": OPERATION_LABEL[r.operationType] || r.operationType || "—",
                "الوصف": r.description || "—",
                "عدد السطور": r.lineCount ?? r.lines?.length ?? 0,
                "نشط": r.isActive ? "نعم" : "لا",
              })),
            }}
          />
        </>
      }
    >
      <FinanceTabsNav />

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(r) => r.id}
          emptyMessage="لا توجد قوالب — أنشئ القالب الأول لتسريع القيود المتكررة"
        />
      </PageStateWrapper>

      <TemplateDialog
        open={creating}
        onOpenChange={setCreating}
        mode="create"
        initial={null}
        onSaved={() => {
          setCreating(false);
          refetch();
        }}
      />
      <TemplateDialog
        open={editing !== null}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        mode="edit"
        initial={editing}
        onSaved={() => {
          setEditing(null);
          refetch();
        }}
      />

      {deleting && (
        <ConfirmDeleteDialog
          open={deleting !== null}
          onOpenChange={(o) => { if (!o) setDeleting(null); }}
          entity={{ type: "journal_template", id: deleting.id, name: deleting.name }}
          deletePath={`/finance/journal-templates/${deleting.id}`}
          invalidateKeys={[["finance-journal-templates"]]}
          onDeleted={() => {
            setDeleting(null);
            refetch();
          }}
        />
      )}
    </PageShell>
  );
}

function TemplateDialog({
  open,
  onOpenChange,
  mode,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial: JournalTemplate | null;
  onSaved: () => void;
}) {
  // On edit, we need the full template *with* lines — the list
  // response only carries the header row. Fetch the detail when the
  // dialog opens for editing. The endpoint is GET
  // /finance/journal-templates/:id — although the static audit
  // tagged it as unused, this fetch wires it up (it's a real
  // backend endpoint, see accounting-engine.ts).
  const detailQ = useApiQuery<{ data: JournalTemplate & { lines: JournalTemplateLine[] } }>(
    ["finance-journal-template-detail", String(initial?.id ?? 0)],
    initial ? `/finance/journal-templates/${initial.id}` : "",
    !!initial,
  );

  const createMut = useApiMutation<JournalTemplate, TemplateForm>(
    "/finance/journal-templates",
    "POST",
    [["finance-journal-templates"]],
    { successMessage: "تم إنشاء القالب" },
  );
  const updateMut = useApiMutation<JournalTemplate, TemplateForm & { __id: number }>(
    (body) => `/finance/journal-templates/${body.__id}`,
    "PUT",
    [["finance-journal-templates"]],
    { successMessage: "تم تحديث القالب" },
  );

  // For edit, hydrate from the fetched detail (which contains lines)
  // when it arrives; before then, render with header-only defaults so
  // the dialog can still open instantly.
  const detail = detailQ.data?.data ?? null;
  const defaults: TemplateForm =
    initial && detail
      ? {
          name: detail.name,
          operationType: detail.operationType,
          description: detail.description ?? "",
          activityType: detail.activityType ?? "",
          lines:
            detail.lines && detail.lines.length > 0
              ? detail.lines.map((l) => ({
                  accountCode: l.accountCode ?? "",
                  lineType: (l.lineType as "debit" | "credit") ?? "debit",
                  description: l.description ?? "",
                }))
              : [{ accountCode: "", lineType: "debit", description: "" }],
        }
      : initial
      ? {
          name: initial.name,
          operationType: initial.operationType,
          description: initial.description ?? "",
          activityType: initial.activityType ?? "",
          lines: [{ accountCode: "", lineType: "debit", description: "" }],
        }
      : EMPTY_DEFAULTS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {mode === "create" ? "قالب قيد جديد" : `تعديل: ${initial?.name ?? ""}`}
          </DialogTitle>
        </DialogHeader>
        <FormShell
          // Remount on each `initial` switch so defaults re-seed when
          // the detail response lands.
          key={`${initial?.id ?? "new"}-${detail ? "loaded" : "fresh"}`}
          schema={templateSchema}
          defaultValues={defaults}
          submitLabel={mode === "create" ? "إنشاء" : "حفظ"}
          secondaryActions={
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            if (mode === "create") {
              await createMut.mutateAsync(values);
            } else if (initial) {
              await updateMut.mutateAsync({ ...values, __id: initial.id });
            }
            onSaved();
          }}
        >
          <FormGrid cols={2}>
            <FormTextField name="name" label="اسم القالب" required placeholder="مثلاً: إهلاك شهري" />
            <FormSelectField
              name="operationType"
              label="نوع العملية"
              required
              options={OPERATION_TYPE_OPTIONS}
            />
          </FormGrid>
          <FormGrid cols={2}>
            <FormTextField name="activityType" label="النشاط (اختياري)" placeholder="مثلاً: إنتاج" />
            <FormTextField name="description" label="الوصف (اختياري)" />
          </FormGrid>
          <LinesEditor />
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

// Lines editor — uses useFieldArray inside FormShell's RHF context.
// Each line picks an account by typing its code (autocomplete would
// require the chart-of-accounts query; kept simple for the first cut).
function LinesEditor() {
  const { control, register } = useFormContext<TemplateForm>();
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">السطور المحاسبية</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => append({ accountCode: "", lineType: "debit", description: "" })}
          className="gap-1"
        >
          <Plus className="h-3.5 w-3.5" /> إضافة سطر
        </Button>
      </div>
      <div className="rounded border divide-y">
        {fields.map((field, i) => (
          <div key={field.id} className="flex items-center gap-2 p-2">
            <span className="text-xs text-muted-foreground w-6 text-center">{i + 1}</span>
            <Input
              {...register(`lines.${i}.accountCode`)}
              placeholder="رقم الحساب"
              className="font-mono text-sm h-8 flex-1"
              dir="ltr"
            />
            <select
              {...register(`lines.${i}.lineType`)}
              className="h-8 border rounded-md text-sm px-2 bg-background"
            >
              <option value="debit">مدين</option>
              <option value="credit">دائن</option>
            </select>
            <Input
              {...register(`lines.${i}.description`)}
              placeholder="وصف (اختياري)"
              className="text-sm h-8 flex-1"
            />
            {fields.length > 1 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => remove(i)}
                className="text-status-error-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
