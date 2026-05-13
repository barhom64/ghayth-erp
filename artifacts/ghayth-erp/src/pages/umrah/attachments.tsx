import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatDateAr } from "@/lib/formatters";
import { Paperclip, ExternalLink, Search } from "lucide-react";

// Standalone /umrah/attachments page — surfaces every row from
// `umrah_attachments` (PR #312) in a single browsable table. The
// reusable UmrahAttachmentsPanel still drops into detail pages
// scoped per-entity; this page is the cross-entity index that ops
// + auditors hit when they want to find "everything pinned to
// pilgrim X" without navigating into each detail page.

const ATTACH_ENTITY_TYPES = [
  { value: "",              label: "كل الأنواع" },
  { value: "mutamer",       label: "معتمر" },
  { value: "sub_agent",     label: "وكيل فرعي" },
  { value: "group",         label: "مجموعة" },
  { value: "agent",         label: "وكيل" },
  { value: "nusk_invoice",  label: "فاتورة نسك" },
  { value: "season",        label: "موسم" },
  { value: "sales_invoice", label: "فاتورة مبيعات" },
  { value: "violation",     label: "مخالفة" },
];

const ATTACH_TYPES = [
  { value: "",                 label: "كل الأنواع" },
  { value: "passport",         label: "جواز سفر" },
  { value: "visa",             label: "تأشيرة" },
  { value: "contract",         label: "عقد" },
  { value: "nusk_file",        label: "ملف نسك" },
  { value: "identity",         label: "هوية / إقامة" },
  { value: "transfer_receipt", label: "إيصال تحويل" },
  { value: "other",            label: "أخرى" },
];

const ENTITY_LABEL: Record<string, string> = Object.fromEntries(
  ATTACH_ENTITY_TYPES.filter((e) => e.value).map((e) => [e.value, e.label]),
);
const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ATTACH_TYPES.filter((t) => t.value).map((t) => [t.value, t.label]),
);

interface UmrahAttachment {
  id: number;
  entityType: string;
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

export default function UmrahAttachmentsPage() {
  const [entityType, setEntityType] = useState("");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");

  const query = new URLSearchParams();
  if (entityType) query.set("entityType", entityType);
  if (type) query.set("type", type);
  const queryString = query.toString();

  const { data: resp, isLoading, isError } = useApiQuery<{ data: UmrahAttachment[] }>(
    ["umrah-attachments-all", entityType, type],
    `/umrah/attachments${queryString ? `?${queryString}` : ""}`,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const all = resp?.data ?? [];
  const items = search.trim()
    ? all.filter((a) => {
        const q = search.trim().toLowerCase();
        return (
          a.title.toLowerCase().includes(q) ||
          (a.notes ?? "").toLowerCase().includes(q) ||
          String(a.entityId).includes(q)
        );
      })
    : all;

  const columns: DataTableColumn<UmrahAttachment>[] = [
    {
      key: "entityType",
      header: "الكيان",
      render: (a) => (
        <span>
          <span className="text-muted-foreground text-xs">{ENTITY_LABEL[a.entityType] || a.entityType}</span>
          {" #" + a.entityId}
        </span>
      ),
    },
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
    { key: "createdAt", header: "تاريخ الإضافة", render: (a) => formatDateAr(a.createdAt) },
  ];

  return (
    <div dir="rtl" lang="ar" className="space-y-6 p-6">
      <header>
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <Paperclip className="h-6 w-6" /> مرفقات العمرة
        </h1>
        <p className="text-sm text-muted-foreground">
          فهرس موحّد لكل وثيقة عمرة. التحرير (إضافة/حذف) يتم من صفحة الكيان نفسه (معتمر / وكيل فرعي / مجموعة / ...).
        </p>
      </header>

      <Card>
        <CardContent className="p-4 grid gap-3 md:grid-cols-3">
          <div>
            <Label htmlFor="att-entity-filter">نوع الكيان</Label>
            <Select value={entityType || "__all__"} onValueChange={(v) => setEntityType(v === "__all__" ? "" : v)}>
              <SelectTrigger id="att-entity-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ATTACH_ENTITY_TYPES.map((e) => (
                  <SelectItem key={e.value || "__all__"} value={e.value || "__all__"}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="att-type-filter">نوع الوثيقة</Label>
            <Select value={type || "__all__"} onValueChange={(v) => setType(v === "__all__" ? "" : v)}>
              <SelectTrigger id="att-type-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ATTACH_TYPES.map((t) => (
                  <SelectItem key={t.value || "__all__"} value={t.value || "__all__"}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="att-search" className="inline-flex items-center gap-1">
              <Search className="h-3.5 w-3.5" /> بحث
            </Label>
            <Input
              id="att-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="عنوان / ملاحظات / رقم الكيان"
            />
          </div>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        {items.length} مرفق {entityType || type || search ? "(بعد التصفية)" : ""}
      </div>

      <DataTable data={items} columns={columns} emptyMessage="لا توجد مرفقات تطابق المعايير" />
    </div>
  );
}
