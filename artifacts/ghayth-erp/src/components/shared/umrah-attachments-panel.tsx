import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Plus, ExternalLink, Trash2, Paperclip } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";

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
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<string>("other");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [fileUrl, setFileUrl] = useState("");
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

  const resetForm = () => {
    setTitle(""); setNotes(""); setFileUrl(""); setType("other");
  };

  const handleAdd = () => {
    if (!title.trim()) {
      toast({ variant: "destructive", title: "العنوان مطلوب" });
      return;
    }
    createMut.mutate(
      {
        entityType,
        entityId,
        type,
        title: title.trim(),
        notes: notes.trim() || undefined,
        fileUrl: fileUrl.trim() || undefined,
      },
      {
        onSuccess: () => {
          resetForm();
          setAdding(false);
        },
      },
    );
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
            className="inline-flex items-center gap-1 text-blue-600 hover:underline"
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
          className="text-red-600 gap-1"
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
          <div className="rounded-md border bg-muted/30 p-3 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="att-type">النوع</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger id="att-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ATTACH_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="att-title">العنوان <span className="text-red-600">*</span></Label>
                <Input id="att-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} />
              </div>
            </div>
            <div>
              <Label htmlFor="att-url">رابط الملف (اختياري)</Label>
              <Input
                id="att-url"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                placeholder="https://… أو storageKey"
              />
            </div>
            <div>
              <Label htmlFor="att-notes">ملاحظات (اختياري)</Label>
              <Textarea id="att-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { resetForm(); setAdding(false); }}>
                إلغاء
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={createMut.isPending} rateLimitAware>
                إضافة
              </Button>
            </div>
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
