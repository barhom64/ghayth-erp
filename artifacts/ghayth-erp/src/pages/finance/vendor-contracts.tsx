import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  useInlineActions,
  RowActions,
  InlineEditForm,
  InlineDeleteConfirm,
} from "@/components/inline-actions";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GuardedButton } from "@/components/shared/permission-gate";
import { SupplierSelect } from "@/components/shared/entity-selects";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { Handshake, Plus, AlertTriangle, CalendarCheck, CalendarX, FileText, Users, Pencil, Trash2 } from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

interface VendorContract {
  id: number;
  vendorId: number;
  vendorName: string | null;
  title: string;
  startDate: string | null;
  endDate: string;
  status: "active" | "expired" | "terminated" | "pending";
  contractValue: number | string | null;
  currency: string | null;
  notes: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<VendorContract["status"], string> = {
  active:     "ساري",
  expired:    "منتهي",
  terminated: "مفسوخ",
  pending:    "قيد التفعيل",
};

const STATUS_BADGE: Record<VendorContract["status"], string> = {
  active:     "bg-emerald-100 text-emerald-800",
  expired:    "bg-amber-100 text-status-warning-foreground",
  terminated: "bg-red-100 text-status-error-foreground",
  pending:    "bg-blue-100 text-status-info-foreground",
};

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // utc-ok: comparing two locally-rounded calendar dates is fine for "days until expiry"
  const end = new Date(iso);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86400000);
}

export default function VendorContractsPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<VendorContract | null>(null);
  const [deleting, setDeleting] = useState<VendorContract | null>(null);

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  const qs = params.toString();

  const { data, isLoading, isError } = useApiQuery<{ data: VendorContract[] }>(
    ["vendor-contracts", statusFilter],
    `/finance/contracts${qs ? `?${qs}` : ""}`,
  );

  // Quick-preview: when the user clicks "تفاصيل" we lazy-fetch the
  // single row's full detail (lines + payment schedule) from
  // GET /finance/contracts/:id. The list endpoint above only carries
  // the header columns.
  const [previewId, setPreviewId] = useState<number | null>(null);
  const { data: detailResp } = useApiQuery<any>(
    ["vendor-contract-detail", String(previewId ?? 0)],
    previewId ? `/finance/contracts/${previewId}` : null,
    { enabled: !!previewId },
  );
  const detail = detailResp?.data ?? detailResp;

  const createMut = useApiMutation("/finance/contracts", "POST", [["vendor-contracts"]]);
  const updateMut = useApiMutation<unknown, { id: number; patch: Partial<VendorContract> }>(
    (body) => `/finance/contracts/${body.id}`,
    "PATCH",
    [["vendor-contracts"]],
    {
      successMessage: "تم تعديل العقد",
      onSuccess: () => setEditing(null),
    },
  );

  // Inline edit + delete on rows. Backend's PATCH /finance/contracts/:id
  // accepts the typical column set; DELETE soft-deletes.
  const {
    editingId, deletingId, editForm,
    startEdit, startDelete, cancelEdit, cancelDelete,
    isPending, handleSave, handleDelete,
  } = useInlineActions({
    endpoint: "/finance/contracts",
    queryKeys: [["vendor-contracts"]],
  });

  const contractEditFields = [
    { key: "title", label: "العنوان" },
    { key: "endDate", label: "تاريخ النهاية", type: "date" as const },
    { key: "contractValue", label: "القيمة", type: "number" as const },
    { key: "status", label: "الحالة" },
    { key: "notes", label: "ملاحظات" },
  ];

  const [form, setForm] = useState({
    vendorId: 0,
    title: "",
    startDate: "",
    endDate: "",
    status: "active" as VendorContract["status"],
    contractValue: "" as number | string,
    currency: "SAR",
    notes: "",
  });

  const rows = data?.data ?? [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  if (isLoading) return <LoadingSpinner />;

  if (isError) return <ErrorState />;


  const activeCount      = rows.filter((r) => r.status === "active").length;
  const expiringSoonCount = rows.filter((r) => {
    if (r.status !== "active") return false;
    const d = daysUntil(r.endDate);
    return d >= 0 && d <= 30;
  }).length;
  const expiredCount     = rows.filter((r) => r.status === "expired").length;
  const totalValue = rows.reduce((s, r) => s + Number(r.contractValue ?? 0), 0);

  const submitCreate = async () => {
    if (!form.vendorId)  { toast({ variant: "destructive", title: "اختر المورد" }); return; }
    if (!form.title.trim()) { toast({ variant: "destructive", title: "العنوان مطلوب" }); return; }
    if (!form.endDate)   { toast({ variant: "destructive", title: "تاريخ النهاية مطلوب" }); return; }
    try {
      await createMut.mutateAsync({
        vendorId: form.vendorId,
        title: form.title,
        startDate: form.startDate || null,
        endDate: form.endDate,
        status: form.status,
        contractValue: form.contractValue === "" ? null : Number(form.contractValue),
        currency: form.currency || "SAR",
        notes: form.notes || null,
      });
      toast({ title: "تم إنشاء العقد" });
      setCreateOpen(false);
      setForm({ ...form, title: "", startDate: "", endDate: "", contractValue: "", notes: "" });
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر الحفظ", description: getErrorMessage(err) });
    }
  };

  const cols: DataTableColumn<VendorContract>[] = [
    {
      key: "title",
      header: "العنوان",
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-sm">{r.title}</span>
          {r.notes && <span className="text-[10px] text-muted-foreground line-clamp-1">{r.notes}</span>}
        </div>
      ),
    },
    {
      key: "vendorName",
      header: "المورد",
      render: (r) => (
        <Link href={`/finance/vendors/${r.vendorId}`}
              className="text-status-info-foreground hover:underline text-xs">
          {r.vendorName ?? `#${r.vendorId}`}
        </Link>
      ),
    },
    {
      key: "startDate",
      header: "البداية",
      render: (r) => r.startDate
        ? <span className="text-xs font-mono">{formatDateAr(r.startDate)}</span>
        : <span className="text-muted-foreground italic">—</span>,
    },
    {
      key: "endDate",
      header: "النهاية",
      render: (r) => {
        const d = daysUntil(r.endDate);
        const isSoon = r.status === "active" && d >= 0 && d <= 30;
        const isPast = d < 0;
        return (
          <span className={`text-xs font-mono inline-flex items-center gap-1
            ${isSoon ? "text-status-warning-foreground font-semibold" : isPast ? "text-status-error-foreground" : ""}`}>
            {formatDateAr(r.endDate)}
            {isSoon && <CalendarCheck className="h-3 w-3" />}
            {isPast && r.status === "active" && <CalendarX className="h-3 w-3" />}
            {isSoon && <span className="text-[10px]">({d} يوم)</span>}
          </span>
        );
      },
    },
    {
      key: "contractValue",
      header: "القيمة",
      render: (r) => {
        const v = Number(r.contractValue ?? 0);
        return v === 0
          ? <span className="text-muted-foreground italic">—</span>
          : <span className="font-mono text-xs">{formatCurrency(v)} {r.currency ?? "SAR"}</span>;
      },
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) => (
        <Badge className={`text-[10px] ${STATUS_BADGE[r.status]}`}>
          {STATUS_LABEL[r.status]}
        </Badge>
      ),
    },
    {
      key: "_actions" as any,
      header: "",
      render: (r) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => setPreviewId(r.id)}
            title="تفاصيل"
          >
            تفاصيل
          </Button>
          <RowActions
            onEdit={() => startEdit(r.id, {
              title: r.title,
              endDate: r.endDate,
              contractValue: r.contractValue ? String(r.contractValue) : "",
              status: r.status,
              notes: r.notes ?? "",
            })}
            onDelete={() => startDelete(r.id)}
            deletePerm="finance:delete"
          />
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="عقود الموردين"
      subtitle="إدارة عقود الإطار مع الموردين، تواريخ النهاية، والتنبيه قبل الانتهاء"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/vendors", label: "الموردون" },
        { label: "العقود" },
      ]}
      actions={
        <>
          <Link href="/finance/vendor-contracts-tracker">
            <Button variant="outline" size="sm">
              <FileText className="h-4 w-4 me-2" />متابعة العقود
            </Button>
          </Link>
          <Link href="/finance/vendors">
            <Button variant="outline" size="sm">
              <Users className="h-4 w-4 me-2" />الموردون
            </Button>
          </Link>
          <PrintButton
            entityType="report_finance_vendor_contracts"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "عقود الموردين", total: printRows.length },
              items: printRows.map((c) => ({
                "المورد": c.vendorName || "—",
                "العنوان": c.title || "—",
                "تاريخ البدء": c.startDate || "—",
                "تاريخ النهاية": c.endDate || "—",
                "أيام للانتهاء": daysUntil(c.endDate),
                "قيمة العقد": Number(c.contractValue || 0),
                "العملة": c.currency || "—",
                "الحالة": STATUS_LABEL[c.status as keyof typeof STATUS_LABEL] || c.status,
              })),
            })}
          />
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <GuardedButton perm="finance:create">
              <Plus className="h-4 w-4 me-1" /> عقد جديد
            </GuardedButton>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>عقد مورد جديد</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              <SupplierSelect value={form.vendorId ? String(form.vendorId) : ""} onChange={(v) => setForm({ ...form, vendorId: Number(v) || 0 })} label="المورد" />
              <div>
                <Label className="text-xs">عنوان العقد *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="مثال: عقد إطار توريد قطع غيار 2026" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">تاريخ البداية</Label>
                  <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">تاريخ النهاية *</Label>
                  <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">القيمة الإجمالية</Label>
                  <Input type="number" value={form.contractValue} onChange={(e) => setForm({ ...form, contractValue: e.target.value })} placeholder="اختياري" />
                </div>
                <div>
                  <Label className="text-xs">العملة</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SAR">SAR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="AED">AED</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">الحالة</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">ساري</SelectItem>
                    <SelectItem value="pending">قيد التفعيل</SelectItem>
                    <SelectItem value="expired">منتهي</SelectItem>
                    <SelectItem value="terminated">مفسوخ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">ملاحظات</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
              <Button onClick={submitCreate} disabled={createMut.isPending}>
                {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Handshake className="h-4 w-4" /> ليش هذي الصفحة؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            عقود الإطار مع الموردين (توريد سنوي / صيانة سنوية / خدمات استشارية) محتاجة
            متابعة من حيث تاريخ النهاية والقيمة الإجمالية. الـ KPI "ينتهي خلال 30 يوم"
            ينبه المسؤول قبل انتهاء العقد ليجدّد قبل وقوع انقطاع التوريد.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي العقود</p>
            <p className="text-lg font-bold font-mono">{formatNumber(rows.length)}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">عقود سارية</p>
            <p className="text-lg font-bold font-mono text-emerald-700">{formatNumber(activeCount)}</p>
          </CardContent>
        </Card>
        <Card className="border-status-warning-surface">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3" /> ينتهي خلال 30 يوم
            </p>
            <p className="text-lg font-bold font-mono text-status-warning-foreground">{formatNumber(expiringSoonCount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">قيمة العقود</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(totalValue)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs text-muted-foreground">الحالة:</span>
        <Badge variant={statusFilter === "" ? "default" : "outline"}
          className="cursor-pointer text-xs"
          onClick={() => setStatusFilter("")}>الكل ({rows.length})</Badge>
        {(Object.keys(STATUS_LABEL) as Array<VendorContract["status"]>).map((s) => {
          const count = rows.filter((r) => r.status === s).length;
          return (
            <Badge key={s}
              variant={statusFilter === s ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => setStatusFilter(s)}>
              {STATUS_LABEL[s]} ({count})
            </Badge>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">العقود ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={rows}
            onSortedDataChange={setPrintRows}
            pageSize={50}
            emptyMessage={
              statusFilter
                ? `لا توجد عقود بحالة "${STATUS_LABEL[statusFilter as VendorContract["status"]]}"`
                : "لا توجد عقود — اضغط 'عقد جديد' لإضافة أول عقد"
            }
          />
        </CardContent>
      </Card>

      {editingId !== null && (
        <InlineEditForm
          fields={contractEditFields}
          initialValues={editForm}
          onSave={(values) => handleSave(editingId, values)}
          onCancel={cancelEdit}
          isPending={isPending}
        />
      )}

      {previewId !== null && (
        <Dialog open={!!previewId} onOpenChange={(o) => !o && setPreviewId(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>تفاصيل العقد {detail?.title || `#${previewId}`}</DialogTitle>
            </DialogHeader>
            {detail ? (
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">المورد:</span> {detail.vendorName ?? "—"}</div>
                  <div><span className="text-muted-foreground">القيمة:</span> {formatCurrency(Number(detail.contractValue ?? 0))} {detail.currency ?? "SAR"}</div>
                  <div><span className="text-muted-foreground">من:</span> {detail.startDate ? formatDateAr(detail.startDate) : "—"}</div>
                  <div><span className="text-muted-foreground">إلى:</span> {formatDateAr(detail.endDate)}</div>
                  <div className="col-span-2"><span className="text-muted-foreground">الحالة:</span> <Badge className={`text-[10px] ${STATUS_BADGE[detail.status as VendorContract["status"]]}`}>{STATUS_LABEL[detail.status as VendorContract["status"]]}</Badge></div>
                  {detail.notes && (
                    <div className="col-span-2 text-xs text-muted-foreground">{detail.notes}</div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">جاري التحميل...</p>
            )}
          </DialogContent>
        </Dialog>
      )}

      {deletingId !== null && (
        <InlineDeleteConfirm
          onConfirm={() => handleDelete(deletingId)}
          onCancel={cancelDelete}
          isPending={isPending}
        />
      )}
    </PageShell>
  );
}
