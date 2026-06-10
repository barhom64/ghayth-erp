import { useRoute, useLocation, Link } from "wouter";
import { useApiQuery, useApiMutation, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PageStatusBadge,
  DataTable, type DataTableColumn, PageShell,
} from "@workspace/ui-core";
import { Package, MapPin, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { CargoTimeline } from "@/components/shared/cargo-timeline";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";

interface ManifestDetail {
  id: number;
  manifestNumber: string;
  status: string;
  customerId: number | null;
  customerName: string | null;
  customerPhone: string | null;
  linkedCustomerName: string | null;
  fleetTripId: number | null;
  fromLocation: string | null;
  toLocation: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  vehiclePlate: string | null;
  driverName: string | null;
  totalWeight: number;
  totalDeclaredValue: number;
  freightRevenue: number;
  freightCost: number;
  notes: string | null;
  items: CargoItem[];
}

interface CargoItem {
  id: number;
  description: string;
  quantity: number;
  weight: number;
  declaredValue: number;
  isHazmat: boolean;
  hazmatClass: string | null;
  notes: string | null;
}

// #1733 Blocker #3 — full 13-state operational lifecycle. The dispatcher
// drives draft → requested → approved → assigned_to_driver; the driver
// carries it through driver_accepted → trip_started → arrived_pickup →
// loaded → in_transit → arrived_delivery → delivered (from the driver
// console — see me-driver.tsx); the dispatcher closes with `completed`
// then flips to `ready_for_invoice` to hand off to the accountant; the
// accountant's materialize action sets `financially_closed`.
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "draft", label: "مسودة" },
  { value: "requested", label: "طلب جديد" },
  { value: "approved", label: "معتمدة" },
  { value: "assigned_to_driver", label: "مسندة للسائق" },
  { value: "driver_accepted", label: "قَبِلها السائق" },
  { value: "trip_started", label: "بدأت الرحلة" },
  { value: "arrived_pickup", label: "وصل لموقع التحميل" },
  { value: "loaded", label: "تم التحميل" },
  { value: "in_transit", label: "في الطريق" },
  { value: "arrived_delivery", label: "وصل لموقع التسليم" },
  { value: "delivered", label: "تم التسليم" },
  { value: "completed", label: "مكتملة (إغلاق تشغيلي)" },
  // #1733 Foundation — dispatcher's "ready for accounting" gate. Until
  // this transition fires, no JE or billing candidate is created.
  { value: "ready_for_invoice", label: "جاهزة للمحاسبة" },
  // Terminal post-invoice state — set by the accountant's materialize action.
  { value: "financially_closed", label: "مُغلقة ماليًا" },
  { value: "cancelled", label: "ملغاة" },
];

// #1733 Foundation — read-only finance badge. The accountant's actions
// flip this; the operator can only mark `not_billable` (internal transfer).
export const BILLING_STATUS_LABEL: Record<string, string> = {
  not_billable: "غير مرسلة للمحاسبة",
  ready_for_accounting: "جاهزة للمحاسبة",
  under_review: "قيد مراجعة المحاسب",
  invoiced: "مفوترة",
  excluded: "مستبعدة ماليًا",
};

export default function CargoDetail() {
  const [, params] = useRoute("/fleet/cargo/:id");
  const id = params?.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemDraft, setItemDraft] = useState({
    description: "", quantity: 1, weight: 0, declaredValue: 0, isHazmat: false, hazmatClass: "",
  });

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: ManifestDetail }>(
    ["cargo-manifest", id || ""],
    id ? `/cargo/manifests/${id}` : null,
    !!id,
  );
  const m = data?.data;

  const statusMut = useApiMutation<unknown, { status: string }>(
    () => `/cargo/manifests/${id}`,
    "PATCH",
    [["cargo-manifest", id || ""], ["cargo-manifests"]],
    { successMessage: "تم تحديث الحالة" },
  );

  const addItem = async () => {
    if (!itemDraft.description.trim()) {
      toast({ variant: "destructive", title: "وصف الصنف مطلوب" });
      return;
    }
    try {
      await apiFetch(`/cargo/manifests/${id}/items`, {
        method: "POST",
        body: JSON.stringify({
          description: itemDraft.description,
          quantity: itemDraft.quantity,
          weight: itemDraft.weight,
          declaredValue: itemDraft.declaredValue,
          isHazmat: itemDraft.isHazmat,
          hazmatClass: itemDraft.isHazmat ? (itemDraft.hazmatClass || null) : null,
        }),
      });
      toast({ title: "تمت إضافة الصنف" });
      setItemDraft({ description: "", quantity: 1, weight: 0, declaredValue: 0, isHazmat: false, hazmatClass: "" });
      setShowAddItem(false);
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذّر الإضافة", description: err?.message || "" });
    }
  };

  const removeItem = async (itemId: number) => {
    try {
      await apiFetch(`/cargo/items/${itemId}`, { method: "DELETE" });
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذّر الحذف", description: err?.message || "" });
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError || !m) return <ErrorState />;

  const itemColumns: DataTableColumn<CargoItem>[] = [
    { key: "description", header: "الوصف", searchable: true },
    { key: "quantity", header: "الكمية", sortable: true },
    { key: "weight", header: "الوزن", render: (i) => `${formatNumber(Number(i.weight))} كغ` },
    { key: "declaredValue", header: "القيمة", render: (i) => formatCurrency(Number(i.declaredValue)) },
    {
      key: "isHazmat", header: "خطرة",
      render: (i) => i.isHazmat
        ? <Badge variant="outline" className="bg-rose-100 text-rose-700">نعم — {i.hazmatClass || "—"}</Badge>
        : <span className="text-xs text-muted-foreground">لا</span>,
    },
    {
      key: "actions",
      header: "",
      render: (i) => (
        <GuardedButton
          perm="fleet.cargo:update"
          variant="ghost"
          size="sm"
          onClick={() => removeItem(i.id)}
          title="حذف الصنف"
        >
          <Trash2 className="h-4 w-4 text-rose-600" />
        </GuardedButton>
      ),
    },
  ];

  return (
    <PageShell
      title={`بوليصة #${m.manifestNumber}`}
      subtitle={`${m.fromLocation || "—"} → ${m.toLocation || "—"}`}
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/cargo", label: "نقل البضائع" },
        { label: m.manifestNumber },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="cargo_manifest"
            entityId={m.id}
            label="طباعة البوليصة"
          />
          <Select
            value={m.status}
            onValueChange={(v) => statusMut.mutate({ status: v })}
          >
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {m.fleetTripId && (
            <Link href={`/fleet/trips/${m.fleetTripId}`}>
              <Button variant="outline" size="sm">
                <MapPin className="h-4 w-4 me-1" />الرحلة #{m.fleetTripId}
              </Button>
            </Link>
          )}
          <GuardedButton
            perm="fleet.cargo:delete"
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!confirm(`حذف البوليصة #${m.manifestNumber}؟`)) return;
              try {
                await apiFetch(`/cargo/manifests/${m.id}`, { method: "DELETE" });
                toast({ title: "تم حذف البوليصة" });
                navigate("/fleet/cargo");
              } catch (err: any) {
                toast({ variant: "destructive", title: "تعذّر الحذف", description: err?.message || "" });
              }
            }}
          >
            <Trash2 className="h-4 w-4 me-1 text-rose-600" />حذف
          </GuardedButton>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">الحالة</CardTitle></CardHeader>
          <CardContent><PageStatusBadge status={m.status} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">العميل</CardTitle></CardHeader>
          <CardContent>
            <p className="font-medium">{m.linkedCustomerName || m.customerName || "—"}</p>
            {m.customerPhone && <p className="text-xs text-muted-foreground font-mono">{m.customerPhone}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">المركبة / السائق</CardTitle></CardHeader>
          <CardContent>
            <p className="font-mono text-sm">{m.vehiclePlate || "—"}</p>
            <p className="text-xs text-muted-foreground">{m.driverName || "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">تاريخ التحميل</CardTitle></CardHeader>
          <CardContent>{m.pickupDate ? formatDateAr(m.pickupDate) : "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">تاريخ التسليم</CardTitle></CardHeader>
          <CardContent>{m.deliveryDate ? formatDateAr(m.deliveryDate) : "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">الإجماليات</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>الوزن: <span className="font-mono">{formatNumber(Number(m.totalWeight))} كغ</span></p>
            <p>القيمة: {formatCurrency(Number(m.totalDeclaredValue))}</p>
            <p>الإيراد: {formatCurrency(Number(m.freightRevenue))}</p>
            <p>التكلفة: {formatCurrency(Number(m.freightCost))}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2"><Package className="h-4 w-4" />الأصناف ({m.items.length})</span>
            <GuardedButton perm="fleet.cargo:update" size="sm" onClick={() => setShowAddItem(true)}>
              <Plus className="h-4 w-4 me-1" />إضافة صنف
            </GuardedButton>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={itemColumns}
            data={m.items}
            emptyMessage="لا أصناف في هذه البوليصة بعد"
            noToolbar
            pageSize={0}
            searchPlaceholder={null}
          />
        </CardContent>
      </Card>

      {/* #1733 Comment 6 — operational timeline.
          Consumes /cargo/manifests/:id/timeline (audit_logs + event_logs
          + billing-candidate events). Renders chronological per-event
          strip with Arabic labels + status-change badges. */}
      <div className="mt-4">
        <CargoTimeline manifestId={m.id} />
      </div>

      {m.notes && (
        <Card className="mt-4">
          <CardHeader><CardTitle className="text-sm">ملاحظات</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{m.notes}</p></CardContent>
        </Card>
      )}

      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent>
          <DialogHeader><DialogTitle>إضافة صنف جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>الوصف *</Label><Input value={itemDraft.description} onChange={(e) => setItemDraft({ ...itemDraft, description: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>الكمية</Label><Input type="number" min="1" value={itemDraft.quantity} onChange={(e) => setItemDraft({ ...itemDraft, quantity: Number(e.target.value) || 1 })} /></div>
              <div><Label>الوزن (كغ)</Label><Input type="number" step="0.01" value={itemDraft.weight} onChange={(e) => setItemDraft({ ...itemDraft, weight: Number(e.target.value) || 0 })} /></div>
              <div><Label>القيمة</Label><Input type="number" step="0.01" value={itemDraft.declaredValue} onChange={(e) => setItemDraft({ ...itemDraft, declaredValue: Number(e.target.value) || 0 })} /></div>
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1 text-sm">
                <input type="checkbox" checked={itemDraft.isHazmat} onChange={(e) => setItemDraft({ ...itemDraft, isHazmat: e.target.checked })} />
                مواد خطرة
              </label>
              {itemDraft.isHazmat && (
                <Input className="h-8 flex-1" placeholder="فئة الخطر (UN 3091…)" value={itemDraft.hazmatClass} onChange={(e) => setItemDraft({ ...itemDraft, hazmatClass: e.target.value })} />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddItem(false)}>إلغاء</Button>
            <Button rateLimitAware onClick={addItem} disabled={!itemDraft.description.trim()}>إضافة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
