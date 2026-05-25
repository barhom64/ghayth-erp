import { useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumn,
  FormShell,
  FormGrid,
  FormTextField,
  FormSelectField,
  FormTextareaField,
} from "@workspace/ui-core";
import { Plus, ExternalLink, Trash2, Paperclip } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";

const attachmentSchema = z.object({
  type: z.string(),
  title: z.string().min(1, "العنوان مطلوب"),
  fileUrl: z.string().optional(),
  notes: z.string().optional(),
});

// Reusable attachments panel — backs GET/POST/DELETE /api/umrah/attachments
// (PR #312). Drop this into any umrah detail page with the right
// entityType + entityId and the panel handles list / add / delete.
//
// The form captures metadata + an optional URL/storageKey to the file
// already in object storage. Full upload-to-storage flow is out of
// scope for this component; once a central upload endpoint exists,
// drop FileDropZone in alongside the form and pipe the resulting URL
// into setFileUrl.

const ATTACH_TYPES = [
  { value: "passport", label: "جواز سفر" },
  { value: "visa", label: "تأشيرة" },
  { value: "contract", label: "عقد" },
  { value: "nusk_file", label: "ملف نسك" },
  { value: "identity", label: "هوية / إقامة" },
  { value: "transfer_receipt", label: "إيصال تحويل" },
  { value: "other", label: "أخرى" },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(ATTACH_TYPES.map((t) => [t.value, t.label]));

export type UmrahAttachmentEntity =
  | "mutamer"
  | "sub_agent"
  | "group"
  | "agent"
  | "nusk_invoice"
  | "season"
  | "sales_invoice"
  | "violation";

interface UmrahAttachment {
  id: number;
  entityType: UmrahAttachmentEntity;
  entityId: number;
  type: string;
  title: string;
  notes: string | null;
  fileUrl: string | null;
  storageKey: string | null;
  fileSize: number | null;
  mimeType: string | null;
  uploadedBy: number | null;
  createdAt: string;
}

interface Props {
  entityType: UmrahAttachmentEntity;
  entityId: number;
}

export function UmrahAttachmentsPanel({ entityType, entityId }: Props) {
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  // queryKey must be string[] for the useApiQuery + invalidate APIs;
  // cast entityId to a string segment so the cache stays scoped per row.
  const queryKey: string[] = ["umrah-attachments", entityType, String(entityId)];
  const { data: resp, isLoading } = useApiQuery<{ data: UmrahAttachment[] }>(
    queryKey,
    `/umrah/attachments?entityType=${entityType}&entityId=${entityId}`,
  );
  const items = resp?.data ?? [];

  const createMut = useApiMutation<{ id: number }, any>(
    () => "/umrah/attachments",
    "POST",
    [queryKey],
    { successMessage: "تمت إضافة المرفق" },
  );

  const handleAdd = async (values: z.infer<typeof attachmentSchema>) => {
    await new Promise<void>((resolve, reject) => {
      createMut.mutate(
        {
          entityType,
          entityId,
          type: values.type,
          title: values.title.trim(),
          notes: values.notes?.trim() || undefined,
          fileUrl: values.fileUrl?.trim() || undefined,
        },
        {
          onSuccess: () => { setAdding(false); resolve(); },
          onError: () => reject(),
        },
      );
    });
  };

  const columns: DataTableColumn<UmrahAttachment>[] = [
    { key: "type", header: "النوع", render: (a) => TYPE_LABEL[a.type] || a.type },
    { key: "title", header: "العنوان", render: (a) => <span className="font-medium">{a.title}</span> },
    {
      key: "fileUrl",
      header: "الملف",
      render: (a) =>
        a.fileUrl ? (
          <a
            href={a.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-status-info-foreground hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> فتح
          </a>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    { key: "notes", header: "ملاحظات", render: (a) => a.notes || "—" },
    {
      key: "createdAt",
      header: "تاريخ الإضافة",
      render: (a) => formatDateAr(a.createdAt),
    },
    {
      key: "actions" as any,
      header: "إجراءات",
      render: (a) => (
        <Button
          variant="ghost"
          size="sm"
          className="text-status-error-foreground gap-1"
          onClick={() => setDeleteTarget({ id: a.id, name: a.title })}
          rateLimitAware
        >
          <Trash2 className="h-3.5 w-3.5" /> حذف
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="inline-flex items-center gap-2 text-base font-semibold">
            <Paperclip className="h-4 w-4" /> المرفقات ({items.length})
          </h3>
          {!adding && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="gap-1">
              <Plus className="h-4 w-4" /> إضافة مرفق
            </Button>
          )}
        </div>

        {adding && (
          <div className="rounded-md border bg-muted/30 p-3">
            <FormShell
              schema={attachmentSchema}
              defaultValues={{ type: "other", title: "", fileUrl: "", notes: "" }}
              submitLabel="إضافة"
              secondaryActions={
                <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
                  إلغاء
                </Button>
              }
              onSubmit={handleAdd}
            >
              <FormGrid cols={2}>
                <FormSelectField name="type" label="النوع" options={ATTACH_TYPES} />
                <FormTextField name="title" label="العنوان" required />
              </FormGrid>
              <FormTextField
                name="fileUrl"
                label="رابط الملف (اختياري)"
                placeholder="https://… أو storageKey"
              />
              <FormTextareaField name="notes" label="ملاحظات (اختياري)" rows={2} />
            </FormShell>
          </div>
        )}

        {isLoading ? (
          <div className="text-sm text-muted-foreground">جاري التحميل…</div>
        ) : (
          <DataTable data={items} columns={columns} emptyMessage="لا توجد مرفقات" />
        )}

        {deleteTarget && (
          <ConfirmDeleteDialog
            open={!!deleteTarget}
            onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
            entity={{ type: "umrah_attachment", id: deleteTarget.id, name: deleteTarget.name }}
            deletePath={`/umrah/attachments/${deleteTarget.id}`}
            invalidateKeys={[queryKey]}
            onDeleted={() => setDeleteTarget(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}
