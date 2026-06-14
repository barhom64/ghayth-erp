import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PageShell } from "@workspace/ui-core";
import {
  ArrowLeft, Plus, Pencil, PlayCircle, AlertCircle, CheckCircle2,
} from "lucide-react";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { todayLocal } from "@/lib/formatters";

// #1733 Comment 3 — pricing engine admin SPA. Operators/managers manage
// transport_price_rules: the table the engine resolves from when an
// accountant clicks "auto-price" on a transport_service_line. Most-specific
// match wins (customerId > vehicleType > route > cargoType > priority).
// The preview action calls POST /transport/price-rules/preview which runs
// the live engine — useful for sanity-checking a new rule before saving.

const SERVICE_TYPES = [
  { value: "cargo_load", label: "نقل حمولة" },
  { value: "passenger_umrah", label: "نقل معتمرين" },
  { value: "passenger_general", label: "نقل ركاب" },
  { value: "equipment_rental", label: "تأجير معدة" },
  { value: "internal_transfer", label: "نقل داخلي" },
  { value: "other", label: "أخرى" },
] as const;

const UNIT_OF_MEASURES = [
  { value: "kg", label: "كيلوغرام" },
  { value: "tonne", label: "طن" },
  { value: "pax", label: "راكب" },
  { value: "trip", label: "رحلة" },
  { value: "km", label: "كم" },
  { value: "hour", label: "ساعة" },
  { value: "day", label: "يوم" },
  { value: "pallet", label: "طبلية" },
  { value: "carton", label: "كرتون" },
] as const;

interface PriceRule {
  id: number;
  customerId: number | null;
  transportServiceType: string;
  vehicleType: string | null;
  routeFrom: string | null;
  routeTo: string | null;
  cargoType: string | null;
  unitOfMeasure: string;
  unitPrice: string;
  minimumCharge: string | null;
  currency: string;
  vatRate: string | null;
  validFrom: string;
  validTo: string | null;
  priority: number;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

interface PreviewResult {
  ruleId: number;
  unitPrice: number;
  unitOfMeasure: string;
  minimumCharge: number | null;
  currency: string;
  vatRate: number | null;
}

function serviceLabel(v: string): string {
  return SERVICE_TYPES.find((s) => s.value === v)?.label ?? v;
}

function uomLabel(v: string): string {
  return UNIT_OF_MEASURES.find((u) => u.value === v)?.label ?? v;
}

interface RuleFormState {
  id?: number;
  customerId: string;
  transportServiceType: string;
  vehicleType: string;
  routeFrom: string;
  routeTo: string;
  cargoType: string;
  unitOfMeasure: string;
  unitPrice: string;
  minimumCharge: string;
  currency: string;
  vatRate: string;
  validFrom: string;
  validTo: string;
  priority: string;
  notes: string;
  isActive: boolean;
}

const EMPTY_FORM: RuleFormState = {
  customerId: "",
  transportServiceType: "cargo_load",
  vehicleType: "",
  routeFrom: "",
  routeTo: "",
  cargoType: "",
  unitOfMeasure: "trip",
  unitPrice: "",
  minimumCharge: "",
  currency: "SAR",
  vatRate: "15",
  validFrom: todayLocal(),
  validTo: "",
  priority: "0",
  notes: "",
  isActive: true,
};

export default function TransportPriceRulesAdmin() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewForm, setPreviewForm] = useState({
    customerId: "",
    transportServiceType: "cargo_load",
    vehicleType: "",
    routeFrom: "",
    routeTo: "",
    cargoType: "",
    serviceDate: todayLocal(),
  });
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const qs = serviceFilter === "all" ? "" : `?serviceType=${serviceFilter}`;
  const { data, isLoading, isError, refetch } = useApiQuery<{ data: PriceRule[] }>(
    ["transport-price-rules", serviceFilter],
    `/transport/price-rules${qs}`,
  );
  const rules = data?.data ?? [];

  const visible = useMemo(
    () => rules.slice().sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.id - b.id;
    }),
    [rules],
  );

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (r: PriceRule) => {
    setForm({
      id: r.id,
      customerId: r.customerId != null ? String(r.customerId) : "",
      transportServiceType: r.transportServiceType,
      vehicleType: r.vehicleType ?? "",
      routeFrom: r.routeFrom ?? "",
      routeTo: r.routeTo ?? "",
      cargoType: r.cargoType ?? "",
      unitOfMeasure: r.unitOfMeasure,
      unitPrice: r.unitPrice,
      minimumCharge: r.minimumCharge ?? "",
      currency: r.currency || "SAR",
      vatRate: r.vatRate ?? "",
      validFrom: r.validFrom?.slice(0, 10) ?? "",
      validTo: r.validTo?.slice(0, 10) ?? "",
      priority: String(r.priority ?? 0),
      notes: r.notes ?? "",
      isActive: r.isActive,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.unitPrice || Number(form.unitPrice) <= 0) {
      toast({ variant: "destructive", title: "السعر مطلوب ويجب أن يكون أكبر من صفر" });
      return;
    }
    if (!form.validFrom) {
      toast({ variant: "destructive", title: "تاريخ بدء السريان مطلوب" });
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        transportServiceType: form.transportServiceType,
        unitOfMeasure: form.unitOfMeasure,
        unitPrice: Number(form.unitPrice),
        validFrom: form.validFrom,
        priority: Number(form.priority || "0"),
        currency: form.currency || "SAR",
      };
      if (form.customerId) body.customerId = Number(form.customerId);
      if (form.vehicleType.trim()) body.vehicleType = form.vehicleType.trim();
      if (form.routeFrom.trim()) body.routeFrom = form.routeFrom.trim();
      if (form.routeTo.trim()) body.routeTo = form.routeTo.trim();
      if (form.cargoType.trim()) body.cargoType = form.cargoType.trim();
      if (form.minimumCharge) body.minimumCharge = Number(form.minimumCharge);
      if (form.vatRate) body.vatRate = Number(form.vatRate);
      if (form.validTo) body.validTo = form.validTo;
      if (form.notes.trim()) body.notes = form.notes.trim();

      if (form.id != null) {
        body.isActive = form.isActive;
        await apiFetch(`/transport/price-rules/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast({ title: "تم تحديث القاعدة" });
      } else {
        await apiFetch("/transport/price-rules", {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast({ title: "تم إنشاء القاعدة" });
      }
      qc.invalidateQueries({ queryKey: ["transport-price-rules", serviceFilter] });
      setDialogOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر الحفظ", description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (r: PriceRule) => {
    try {
      await apiFetch(`/transport/price-rules/${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !r.isActive }),
      });
      toast({ title: r.isActive ? "تم تعطيل القاعدة" : "تم تفعيل القاعدة" });
      qc.invalidateQueries({ queryKey: ["transport-price-rules", serviceFilter] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر التحديث", description: message });
    }
  };

  const runPreview = async () => {
    setPreviewing(true);
    setPreviewError(null);
    setPreviewResult(null);
    try {
      const body: Record<string, unknown> = {
        transportServiceType: previewForm.transportServiceType,
        serviceDate: previewForm.serviceDate,
      };
      if (previewForm.customerId) body.customerId = Number(previewForm.customerId);
      if (previewForm.vehicleType.trim()) body.vehicleType = previewForm.vehicleType.trim();
      if (previewForm.routeFrom.trim()) body.routeFrom = previewForm.routeFrom.trim();
      if (previewForm.routeTo.trim()) body.routeTo = previewForm.routeTo.trim();
      if (previewForm.cargoType.trim()) body.cargoType = previewForm.cargoType.trim();

      const res = await apiFetch<{ data: PreviewResult | null }>(
        "/transport/price-rules/preview",
        { method: "POST", body: JSON.stringify(body) },
      );
      if (!res?.data) {
        setPreviewError(
          "لا توجد قاعدة مطابقة لهذا التركيب. عدّل المعايير أو أنشئ قاعدة جديدة.",
        );
      } else {
        setPreviewResult(res.data);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setPreviewError(message);
    } finally {
      setPreviewing(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="قواعد التسعير"
      subtitle="إدارة جدول الأسعار الذي يستخدمه المحاسب لتسعير بنود خدمات النقل تلقائياً"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/transport/bookings", label: "حجوزات النقل" },
        { label: "قواعد التسعير" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <PlayCircle className="h-4 w-4 me-1" />جرّب المحرّك
          </Button>
          <Button size="sm" onClick={openCreate} rateLimitAware>
            <Plus className="h-4 w-4 me-1" />قاعدة جديدة
          </Button>
          <Button asChild variant="outline" size="sm"><Link href="/fleet/transport/bookings">
              <ArrowLeft className="h-4 w-4 me-1" />العودة
            </Link></Button>
        </div>
      }
    >
      <FleetTabsNav />

      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Label className="text-xs text-muted-foreground">نوع الخدمة</Label>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                {SERVICE_TYPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
            <div className="text-xs text-muted-foreground ms-auto">
              {visible.length} قاعدة
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              لا توجد قواعد تسعير حالياً. أنشئ قاعدة أولى ليتمكّن المحرّك من تسعير
              بنود خدمات النقل تلقائياً.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-subtle text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start">نوع الخدمة</th>
                    <th className="px-3 py-2 text-start">معايير المطابقة</th>
                    <th className="px-3 py-2 text-start">الوحدة</th>
                    <th className="px-3 py-2 text-start">السعر</th>
                    <th className="px-3 py-2 text-start">الحد الأدنى</th>
                    <th className="px-3 py-2 text-start">السريان</th>
                    <th className="px-3 py-2 text-start">الأولوية</th>
                    <th className="px-3 py-2 text-start">الحالة</th>
                    <th className="px-3 py-2 text-start" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-surface-subtle">
                      <td className="px-3 py-2">{serviceLabel(r.transportServiceType)}</td>
                      <td className="px-3 py-2 text-xs space-y-0.5">
                        {r.customerId != null && (
                          <div>العميل #{r.customerId}</div>
                        )}
                        {r.vehicleType && <div>المركبة: {r.vehicleType}</div>}
                        {(r.routeFrom || r.routeTo) && (
                          <div>
                            {r.routeFrom ?? "*"} → {r.routeTo ?? "*"}
                          </div>
                        )}
                        {r.cargoType && <div>البضاعة: {r.cargoType}</div>}
                        {!r.customerId && !r.vehicleType && !r.routeFrom && !r.routeTo && !r.cargoType && (
                          <span className="text-muted-foreground">قاعدة عامة</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{uomLabel(r.unitOfMeasure)}</td>
                      <td className="px-3 py-2 font-mono">
                        {Number(r.unitPrice).toLocaleString("ar-SA")} {r.currency}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.minimumCharge != null
                          ? `${Number(r.minimumCharge).toLocaleString("ar-SA")} ${r.currency}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono">
                        {r.validFrom?.slice(0, 10)} → {r.validTo?.slice(0, 10) ?? "∞"}
                      </td>
                      <td className="px-3 py-2 font-mono">{r.priority}</td>
                      <td className="px-3 py-2">
                        {r.isActive ? (
                          <Badge className="bg-status-success-surface text-status-success-foreground">
                            مفعّلة
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            معطّلة
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(r)}
                            title="تعديل"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleActive(r)}
                            className="text-xs"
                          >
                            {r.isActive ? "تعطيل" : "تفعيل"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {form.id != null ? "تعديل قاعدة تسعير" : "قاعدة تسعير جديدة"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">معايير المطابقة</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div>
                  <Label>نوع الخدمة *</Label>
                  <Select
                    value={form.transportServiceType}
                    onValueChange={(v) => setForm({ ...form, transportServiceType: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>معرّف العميل (اختياري)</Label>
                  <Input
                    type="number"
                    value={form.customerId}
                    onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                    placeholder="اتركه فارغاً للقواعد العامة"
                  />
                </div>
                <div>
                  <Label>نوع المركبة (اختياري)</Label>
                  <Input
                    value={form.vehicleType}
                    onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
                    placeholder="truck / van / bus …"
                  />
                </div>
                <div>
                  <Label>نوع البضاعة (اختياري)</Label>
                  <Input
                    value={form.cargoType}
                    onChange={(e) => setForm({ ...form, cargoType: e.target.value })}
                  />
                </div>
                <div>
                  <Label>من (اختياري)</Label>
                  <Input
                    value={form.routeFrom}
                    onChange={(e) => setForm({ ...form, routeFrom: e.target.value })}
                  />
                </div>
                <div>
                  <Label>إلى (اختياري)</Label>
                  <Input
                    value={form.routeTo}
                    onChange={(e) => setForm({ ...form, routeTo: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">السعر</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div>
                  <Label>الوحدة *</Label>
                  <Select
                    value={form.unitOfMeasure}
                    onValueChange={(v) => setForm({ ...form, unitOfMeasure: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNIT_OF_MEASURES.map((u) => (
                        <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>سعر الوحدة *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.unitPrice}
                    onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                  />
                </div>
                <div>
                  <Label>الحد الأدنى للفاتورة (اختياري)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.minimumCharge}
                    onChange={(e) => setForm({ ...form, minimumCharge: e.target.value })}
                  />
                </div>
                <div>
                  <Label>العملة</Label>
                  <Input
                    maxLength={3}
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                  />
                </div>
                <div>
                  <Label>نسبة الضريبة %</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.vatRate}
                    onChange={(e) => setForm({ ...form, vatRate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>الأولوية</Label>
                  <Input
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">السريان</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div>
                  <Label>من تاريخ *</Label>
                  <Input
                    type="date"
                    value={form.validFrom}
                    onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                  />
                </div>
                <div>
                  <Label>إلى تاريخ (اختياري)</Label>
                  <Input
                    type="date"
                    value={form.validTo}
                    onChange={(e) => setForm({ ...form, validTo: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>ملاحظات</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={save} disabled={submitting} rateLimitAware>
              {submitting ? "جاري الحفظ…" : form.id != null ? "حفظ التعديلات" : "إنشاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تجربة محرّك التسعير</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              يقوم المحرّك بترشيح أفضل قاعدة مطابقة (الأكثر تخصيصاً، ثم الأولوية الأعلى)
              لهذا التركيب من المعايير في التاريخ المختار.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>نوع الخدمة *</Label>
                <Select
                  value={previewForm.transportServiceType}
                  onValueChange={(v) => setPreviewForm({ ...previewForm, transportServiceType: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>تاريخ الخدمة *</Label>
                <Input
                  type="date"
                  value={previewForm.serviceDate}
                  onChange={(e) => setPreviewForm({ ...previewForm, serviceDate: e.target.value })}
                />
              </div>
              <div>
                <Label>معرّف العميل</Label>
                <Input
                  type="number"
                  value={previewForm.customerId}
                  onChange={(e) => setPreviewForm({ ...previewForm, customerId: e.target.value })}
                />
              </div>
              <div>
                <Label>نوع المركبة</Label>
                <Input
                  value={previewForm.vehicleType}
                  onChange={(e) => setPreviewForm({ ...previewForm, vehicleType: e.target.value })}
                />
              </div>
              <div>
                <Label>من</Label>
                <Input
                  value={previewForm.routeFrom}
                  onChange={(e) => setPreviewForm({ ...previewForm, routeFrom: e.target.value })}
                />
              </div>
              <div>
                <Label>إلى</Label>
                <Input
                  value={previewForm.routeTo}
                  onChange={(e) => setPreviewForm({ ...previewForm, routeTo: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>نوع البضاعة</Label>
                <Input
                  value={previewForm.cargoType}
                  onChange={(e) => setPreviewForm({ ...previewForm, cargoType: e.target.value })}
                />
              </div>
            </div>
            {previewResult && (
              <Card className="border-status-success-foreground/30 bg-status-success-surface">
                <CardContent className="p-3 text-sm space-y-1">
                  <div className="flex items-center gap-2 font-medium text-status-success-foreground">
                    <CheckCircle2 className="h-4 w-4" />
                    تم العثور على قاعدة مطابقة (#{previewResult.ruleId})
                  </div>
                  <div className="font-mono">
                    {previewResult.unitPrice.toLocaleString("ar-SA")} {previewResult.currency}
                    {" "}لكل {uomLabel(previewResult.unitOfMeasure)}
                  </div>
                  {previewResult.minimumCharge != null && (
                    <div className="text-xs text-muted-foreground">
                      الحد الأدنى: {previewResult.minimumCharge.toLocaleString("ar-SA")} {previewResult.currency}
                    </div>
                  )}
                  {previewResult.vatRate != null && (
                    <div className="text-xs text-muted-foreground">
                      الضريبة: {previewResult.vatRate}%
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {previewError && (
              <Card className="border-rose-300 bg-rose-50">
                <CardContent className="p-3 text-sm text-rose-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {previewError}
                </CardContent>
              </Card>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>إغلاق</Button>
            <Button onClick={runPreview} disabled={previewing} rateLimitAware>
              {previewing ? "جاري الحساب…" : "احسب السعر"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
