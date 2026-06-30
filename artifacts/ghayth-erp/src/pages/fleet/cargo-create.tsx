import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DataTable, type DataTableColumn, PageShell,
} from "@workspace/ui-core";
import { Plus, Trash2, Save, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { GuardedButton } from "@/components/shared/permission-gate";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";
import { useVehicleDriverDefault } from "@/hooks/use-vehicle-driver-default";

interface VehicleOption { id: number; plateNumber: string; }
interface DriverOption { id: number; name: string; status: string; }
interface ClientOption { id: number; name: string; phone?: string | null; }

interface ItemDraft {
  description: string;
  quantity: number;
  weight: number;
  declaredValue: number;
  isHazmat: boolean;
  hazmatClass?: string;
}

export default function CargoCreate() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<Record<string, any>>({
    manifestNumber: "",
    customerId: "",
    customerName: "",
    customerPhone: "",
    fromLocation: "",
    toLocation: "",
    pickupDate: "",
    deliveryDate: "",
    vehicleId: "",
    driverId: "",
    freightRevenue: 0,
    freightCost: 0,
    notes: "",
  });

  // الكيان يقود التجربة: اختيار المركبة يُعبّئ سائقها المعيَّن تلقائيًا (قابل للتغيير).
  useVehicleDriverDefault(form.vehicleId, form.driverId, (v) => setForm((f) => ({ ...f, driverId: v })));

  const [items, setItems] = useState<ItemDraft[]>([]);
  const [draft, setDraft] = useState<ItemDraft>({
    description: "",
    quantity: 1,
    weight: 0,
    declaredValue: 0,
    isHazmat: false,
  });

  const { data: vehiclesResp } = useApiQuery<{ data: VehicleOption[] }>(
    ["fleet-vehicles-options"],
    "/fleet/vehicles?limit=500",
  );
  const { data: driversResp } = useApiQuery<{ data: DriverOption[] }>(
    ["fleet-drivers-options"],
    "/fleet/drivers?limit=500",
  );
  const { data: clientsResp } = useApiQuery<{ data: ClientOption[] }>(
    ["clients-options-cargo"],
    "/clients?limit=500",
  );
  const vehicles = vehiclesResp?.data || [];
  const drivers = (driversResp?.data || []).filter(
    (d) => d.status === "available" || d.status === "on_trip" || !d.status,
  );
  const clients = clientsResp?.data || [];

  const totalWeight = items.reduce((s, i) => s + i.quantity * i.weight, 0);
  const totalValue = items.reduce((s, i) => s + i.quantity * i.declaredValue, 0);

  const addDraftItem = () => {
    if (!draft.description.trim()) {
      toast({ variant: "destructive", title: "وصف الصنف مطلوب" });
      return;
    }
    setItems([...items, draft]);
    setDraft({ description: "", quantity: 1, weight: 0, declaredValue: 0, isHazmat: false });
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    if (!form.manifestNumber.trim()) {
      toast({ variant: "destructive", title: "رقم البوليصة مطلوب" });
      return;
    }
    // #1812 Wave 0.2 — manifest must link a structured CRM customer.
    // Backend's createManifestSchema rejects free-text customerName
    // without customerId; surface that here so the user gets a clear
    // message instead of a 400.
    if (!form.customerId) {
      toast({
        variant: "destructive",
        title: "اختر العميل من السجل (CRM)",
        description: "بوليصة الشحن لا تُنشأ بدون عميل منظَّم. اسم العميل النصّي وحده غير مقبول.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const manifestPayload: Record<string, any> = {
        manifestNumber: form.manifestNumber,
        fromLocation: form.fromLocation || null,
        toLocation: form.toLocation || null,
        pickupDate: form.pickupDate || null,
        deliveryDate: form.deliveryDate || null,
        notes: form.notes || null,
        freightRevenue: Number(form.freightRevenue) || 0,
        freightCost: Number(form.freightCost) || 0,
      };
      if (form.customerId) manifestPayload.customerId = Number(form.customerId);
      if (form.customerName) manifestPayload.customerName = form.customerName;
      if (form.customerPhone) manifestPayload.customerPhone = form.customerPhone;
      if (form.vehicleId) manifestPayload.vehicleId = Number(form.vehicleId);
      if (form.driverId) manifestPayload.driverId = Number(form.driverId);

      const created = await apiFetch<{ data: { id: number } }>("/cargo/manifests", {
        method: "POST",
        body: JSON.stringify(manifestPayload),
      });
      const manifestId = created.data.id;

      // Push items in sequence so each item's recompute settles into
      // the manifest totals.
      for (const it of items) {
        await apiFetch(`/cargo/manifests/${manifestId}/items`, {
          method: "POST",
          body: JSON.stringify({
            description: it.description,
            quantity: it.quantity,
            weight: it.weight,
            declaredValue: it.declaredValue,
            isHazmat: it.isHazmat,
            hazmatClass: it.isHazmat ? (it.hazmatClass || null) : null,
          }),
        });
      }

      toast({ title: "تم إنشاء بوليصة الشحن", description: `بوليصة #${manifestId}` });
      navigate(`/fleet/cargo/${manifestId}`);
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر الإنشاء", description: getErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const itemColumns: DataTableColumn<ItemDraft & { _idx: number }>[] = [
    { key: "description", header: "الوصف", render: (i) => i.description },
    { key: "quantity", header: "الكمية", render: (i) => i.quantity },
    { key: "weight", header: "الوزن (كغ)", render: (i) => i.weight },
    { key: "declaredValue", header: "القيمة", render: (i) => i.declaredValue },
    {
      key: "isHazmat",
      header: "خطرة",
      render: (i) => i.isHazmat ? <span className="text-rose-700 text-xs font-medium">نعم — {i.hazmatClass || "?"}</span> : <span className="text-xs text-muted-foreground">لا</span>,
    },
    {
      key: "actions",
      header: "",
      render: (i) => (
        <Button variant="ghost" size="sm" onClick={() => removeItem(i._idx)}>
          <Trash2 className="h-4 w-4 text-rose-600" />
        </Button>
      ),
    },
  ];

  return (
    <PageShell
      title="بوليصة شحن جديدة"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/cargo", label: "نقل البضائع" },
        { label: "إنشاء" },
      ]}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" />بيانات البوليصة</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>رقم البوليصة *</Label>
            <Input value={form.manifestNumber} onChange={(e) => setForm({ ...form, manifestNumber: e.target.value })} placeholder="BL-2026-001" />
          </div>
          <div className="md:col-span-2">
            <Label>العميل (CRM) *</Label>
            <Select
              value={form.customerId || "none"}
              onValueChange={(v) => {
                if (v === "none") {
                  setForm({ ...form, customerId: "", customerName: "", customerPhone: "" });
                  return;
                }
                const c = clients.find((x) => String(x.id) === v);
                setForm({
                  ...form,
                  customerId: v,
                  customerName: c?.name ?? "",
                  customerPhone: c?.phone ?? "",
                });
              }}
            >
              <SelectTrigger><SelectValue placeholder="اختر العميل من السجل…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— اختر —</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!form.customerId && (
              <p className="text-xs text-rose-700 mt-1">
                بوليصة الشحن لا تُنشأ بدون عميل من CRM. اسم العميل النصّي وحده غير مقبول.
              </p>
            )}
          </div>
          {form.customerId && (
            <div className="md:col-span-2 grid grid-cols-2 gap-4 bg-surface-subtle rounded-md p-2">
              <div>
                <Label className="text-xs text-muted-foreground">اسم العميل (من CRM)</Label>
                <p className="font-medium">{form.customerName || "—"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">جوال العميل</Label>
                <p className="font-mono text-sm">{form.customerPhone || "—"}</p>
              </div>
            </div>
          )}
          <div>
            <Label>من</Label>
            <Input value={form.fromLocation} onChange={(e) => setForm({ ...form, fromLocation: e.target.value })} placeholder="جدة" />
          </div>
          <div>
            <Label>إلى</Label>
            <Input value={form.toLocation} onChange={(e) => setForm({ ...form, toLocation: e.target.value })} placeholder="الرياض" />
          </div>
          <div>
            <Label>تاريخ التحميل</Label>
            <UnifiedDateInput value={form.pickupDate} onChange={(v) => setForm({ ...form, pickupDate: v })} />
          </div>
          <div>
            <Label>تاريخ التسليم</Label>
            <UnifiedDateInput value={form.deliveryDate} onChange={(v) => setForm({ ...form, deliveryDate: v })} />
          </div>
          <div>
            <Label>المركبة</Label>
            <Select value={form.vehicleId || "none"} onValueChange={(v) => setForm({ ...form, vehicleId: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="بدون" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>{v.plateNumber}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>السائق</Label>
            <Select value={form.driverId || "none"} onValueChange={(v) => setForm({ ...form, driverId: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="بدون" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}{d.status === "on_trip" ? " (في رحلة)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الإيراد (للعميل)</Label>
            <Input type="number" value={form.freightRevenue} onChange={(e) => setForm({ ...form, freightRevenue: e.target.value })} />
          </div>
          <div>
            <Label>التكلفة</Label>
            <Input type="number" value={form.freightCost} onChange={(e) => setForm({ ...form, freightCost: e.target.value })} />
          </div>
          <div className="col-span-full">
            <Label>ملاحظات</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>الأصناف ({items.length})</span>
            <span className="text-xs text-muted-foreground">
              إجمالي الوزن: {totalWeight.toFixed(2)} كغ · القيمة: {totalValue.toFixed(2)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-3 items-end">
            <div className="col-span-2">
              <Label>الوصف</Label>
              <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="كرتون 50×30×30" />
            </div>
            <div>
              <Label>الكمية</Label>
              <Input type="number" min="1" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) || 1 })} />
            </div>
            <div>
              <Label>الوزن (كغ)</Label>
              <Input type="number" step="0.01" value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>القيمة</Label>
              <Input type="number" step="0.01" value={draft.declaredValue} onChange={(e) => setDraft({ ...draft, declaredValue: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Button rateLimitAware type="button" onClick={addDraftItem} className="w-full">
                <Plus className="h-4 w-4 me-1" />إضافة
              </Button>
            </div>
            <div className="col-span-full flex items-center gap-3 text-xs text-muted-foreground">
              <label className="inline-flex items-center gap-1">
                <input type="checkbox" checked={draft.isHazmat} onChange={(e) => setDraft({ ...draft, isHazmat: e.target.checked })} />
                مواد خطرة
              </label>
              {draft.isHazmat && (
                <Input className="h-7 w-32" placeholder="فئة الخطر (UN 3091…)" value={draft.hazmatClass || ""} onChange={(e) => setDraft({ ...draft, hazmatClass: e.target.value })} />
              )}
            </div>
          </div>
          {items.length === 0 ? (
            <p className="text-muted-foreground text-center text-sm py-4">لم تُضف أصناف بعد</p>
          ) : (
            <DataTable
              columns={itemColumns}
              data={items.map((i, _idx) => ({ ...i, _idx }))}
              noToolbar
              pageSize={0}
              searchPlaceholder={null}
            />
          )}
        </CardContent>
      </Card>

      <div className="mt-4 flex justify-end gap-2">
        <Button asChild variant="outline"><Link href="/fleet/cargo">إلغاء</Link></Button>
        <Button rateLimitAware onClick={submit} disabled={submitting || !form.manifestNumber.trim() || !form.customerId}>
          <Save className="h-4 w-4 me-1" />
          {submitting ? "جاري الحفظ…" : "حفظ البوليصة"}
        </Button>
      </div>
    </PageShell>
  );
}
