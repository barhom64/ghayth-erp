import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
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
import { Handshake, Plus, AlertTriangle, CalendarCheck, CalendarX } from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";

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

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  const qs = params.toString();

  const { data, isLoading, isError } = useApiQuery<{ data: VendorContract[] }>(
    ["vendor-contracts", statusFilter],
    `/finance/contracts${qs ? `?${qs}` : ""}`,
  );

  const createMut = useApiMutation("/finance/contracts", "POST", [["vendor-contracts"]]);

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

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const rows = data?.data ?? [];

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
  ];

  return (
    <PageShell
      title="عقود الموردين"
      subtitle="vendor_contracts — إدارة عقود الإطار مع الموردين، تواريخ النهاية، التنبيه قبل الانتهاء"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/vendors", label: "الموردون" },
        { label: "العقود" },
      ]}
      actions={
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
            pageSize={50}
            emptyMessage={
              statusFilter
                ? `لا توجد عقود بحالة "${STATUS_LABEL[statusFilter as VendorContract["status"]]}"`
                : "لا توجد عقود — اضغط 'عقد جديد' لإضافة أول عقد"
            }
          />
        </CardContent>
      </Card>

      <Card className="mt-4 bg-status-warning-surface/30 border-status-warning-surface">
        <CardContent className="p-3 text-xs text-status-warning-foreground">
          ⓘ التعديل والحذف — follow-up PR (PATCH/DELETE /finance/contracts/:id موجود في الـ backend).
          حالياً للتعديل استخدم الـ API مباشرة.
        </CardContent>
      </Card>
    </PageShell>
  );
}
