import { useState } from "react";
import { PageShell } from "@workspace/ui-core";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn, AdvancedFilters, useFilters, applyFilters } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatUmrahDate } from "@/lib/formatters";
import { Paperclip, Download } from "lucide-react";
import { PrintButton } from "@/components/shared/print-button";

// Standalone /umrah/attachments page — surfaces every row from
// `umrah_attachments` (PR #312) in a single browsable table. The
// per-entity attachments now render via the unified EntityDocuments
// panel inside each detail page (معتمر / وكيل / وكيل فرعي / موسم);
// this page is the cross-entity index that ops + auditors hit when
// they want to find "everything pinned to pilgrim X" without
// navigating into each detail page.

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
  const [filters, setFilters] = useFilters();

  const query = new URLSearchParams();
  if (filters.entityType) query.set("entityType", filters.entityType);
  if (filters.type) query.set("type", filters.type);
  const queryString = query.toString();

  const { data: resp, isLoading, isError } = useApiQuery<{ data: UmrahAttachment[] }>(
    ["umrah-attachments-all", filters.entityType, filters.type],
    `/umrah/attachments${queryString ? `?${queryString}` : ""}`,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const all = resp?.data ?? [];
  const items = applyFilters(all, filters, {
    searchFields: ["title", "notes", "entityId"],
  });

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
      // U-16-P1 — server-mediated download.
      //
      // The old renderer linked directly to `a.fileUrl` (raw cloud URL),
      // bypassing the server's ACL check, document_access_log write,
      // companyId tenant guard, X-Content-Type-Options: nosniff header,
      // and soft-delete check. The /api/documents/:id/download route
      // wraps all of those. Same pattern used by the shared
      // documents-page.tsx (line 202-203).
      key: "download",
      header: "الملف",
      render: (a) =>
        a.storageKey ? (
          <button
            type="button"
            onClick={() => window.open(`/api/documents/${a.id}/download`, "_blank")}
            className="inline-flex items-center gap-1 text-status-info-foreground hover:underline"
            aria-label="تحميل المرفق"
          >
            <Download className="h-3.5 w-3.5" /> تحميل
          </button>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    { key: "notes", header: "ملاحظات", render: (a) => a.notes || "—" },
    { key: "createdAt", header: "تاريخ الإضافة", render: (a) => formatUmrahDate(a.createdAt) },
  ];

  return (
    <PageShell
      title="مرفقات العمرة"
      subtitle="فهرس موحّد لكل وثيقة عمرة. التحرير (إضافة/حذف) يتم من صفحة الكيان نفسه (معتمر / وكيل فرعي / مجموعة / ...)."
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "المرفقات" }]}
      actions={
        <PrintButton
          entityType="report_umrah_attachments"
          entityId="list"
          size="icon"
          label="طباعة فهرس المرفقات"
          payload={() => ({
            entity: {
              title: "فهرس مرفقات العمرة",
              total: items.length,
              filterEntityType: filters.entityType ? ENTITY_LABEL[filters.entityType] : "الكل",
              filterAttachmentType: filters.type ? TYPE_LABEL[filters.type] : "الكل",
              searchTerm: filters.search.trim() || "—",
            },
            items: items.map((a: any) => ({
              "نوع الكيان": ENTITY_LABEL[a.entityType] || a.entityType,
              "رقم الكيان": a.entityId ?? "—",
              "العنوان": a.title || "—",
              "نوع الوثيقة": TYPE_LABEL[a.type] || a.type || "—",
              "ملاحظات": a.notes || "—",
              "تاريخ الإضافة": a.createdAt ? formatUmrahDate(a.createdAt) : "—",
            })),
          })}
        />
      }
    >
      <UmrahTabsNav />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث: عنوان / ملاحظات / رقم الكيان...",
          extraFilters: [
            { key: "entityType", label: "نوع الكيان", options: ATTACH_ENTITY_TYPES.filter((e) => e.value).map((e) => ({ value: e.value, label: e.label })) },
            { key: "type", label: "نوع الوثيقة", options: ATTACH_TYPES.filter((t) => t.value).map((t) => ({ value: t.value, label: t.label })) },
          ],
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={items.length}
      />

      <DataTable data={items} columns={columns} emptyMessage="لا توجد مرفقات تطابق المعايير" noToolbar />
    </PageShell>
  );
}
