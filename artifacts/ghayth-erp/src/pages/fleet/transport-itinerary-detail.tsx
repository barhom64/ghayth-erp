import { useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
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
  ArrowLeft, Plus, Pencil, Trash2, Calendar, MapPin, Truck,
  Clock, Wand2,
} from "lucide-react";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { AssignmentSuggestDialog } from "@/components/shared/assignment-suggest-dialog";

// #1812 — itinerary detail with leg editor. The dispatcher sequences
// chained trips here, assigns vehicle + driver per leg, and the
// engine respects the chain when computing rest/conflict on
// subsequent legs.

const LEG_TYPES = [
  { value: "transit", label: "انتقال" },
  { value: "pickup", label: "تحميل" },
  { value: "dropoff", label: "تسليم" },
  { value: "rest", label: "استراحة" },
  { value: "fuel", label: "تزود وقود" },
  { value: "inspection", label: "فحص" },
  { value: "custom", label: "مخصص" },
] as const;

const LEG_STATUSES = [
  { value: "pending", label: "بانتظار" },
  { value: "scheduled", label: "مجدول" },
  { value: "assigned", label: "مسند" },
  { value: "in_progress", label: "جاري التنفيذ" },
  { value: "completed", label: "اكتمل" },
  { value: "cancelled", label: "ملغى" },
  { value: "skipped", label: "تم تجاوزه" },
] as const;

const LEG_STATUS_TONE: Record<string, string> = {
  pending:    "bg-surface-subtle text-muted-foreground",
  scheduled:  "bg-status-info-surface text-status-info-foreground",
  assigned:   "bg-purple-50 text-purple-700",
  in_progress:"bg-status-warning-surface text-status-warning-foreground",
  completed:  "bg-status-success-surface text-status-success-foreground",
  cancelled:  "bg-rose-100 text-rose-700",
  skipped:    "bg-surface-subtle text-muted-foreground",
};

interface Leg {
  id: number;
  legNumber: number;
  legType: string;
  originText: string | null;
  destinationText: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  dropoffWindowStart: string | null;
  dropoffWindowEnd: string | null;
  requiredVehicleClass: string | null;
  assignedVehicleId: number | null;
  assignedDriverId: number | null;
  dispatchOrderId: number | null;
  estimatedDistanceKm: string | null;
  estimatedDurationMinutes: number | null;
  status: string;
  notes: string | null;
}

interface ItineraryDetail {
  id: number;
  itineraryName: string;
  transportServiceType: string;
  customerId: number | null;
  umrahGroupId: number | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  notes: string | null;
  legs: Leg[];
}

interface LegFormState {
  id?: number;
  legNumber: string;
  legType: string;
  originText: string;
  destinationText: string;
  scheduledStart: string;
  scheduledEnd: string;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  dropoffWindowStart: string;
  dropoffWindowEnd: string;
  requiredVehicleClass: string;
  estimatedDistanceKm: string;
  estimatedDurationMinutes: string;
  status: string;
  notes: string;
}

const EMPTY_LEG: LegFormState = {
  legNumber: "1",
  legType: "transit",
  originText: "",
  destinationText: "",
  scheduledStart: "",
  scheduledEnd: "",
  pickupWindowStart: "",
  pickupWindowEnd: "",
  dropoffWindowStart: "",
  dropoffWindowEnd: "",
  requiredVehicleClass: "",
  estimatedDistanceKm: "",
  estimatedDurationMinutes: "",
  status: "pending",
  notes: "",
};

function legTypeLabel(v: string): string {
  return LEG_TYPES.find((t) => t.value === v)?.label ?? v;
}

function legStatusLabel(v: string): string {
  return LEG_STATUSES.find((s) => s.value === v)?.label ?? v;
}

export default function TransportItineraryDetail() {
  const [, params] = useRoute("/fleet/transport/itineraries/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const id = params?.id;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<LegFormState>(EMPTY_LEG);
  const [suggestLegId, setSuggestLegId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: ItineraryDetail }>(
    ["transport-itinerary", id || ""],
    id ? `/transport/itineraries/${id}` : null,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data) return <ErrorState />;
  const it = data.data;

  const queryKey = ["transport-itinerary", id || ""];

  const openCreateLeg = () => {
    const nextLegNum = it.legs.length
      ? Math.max(...it.legs.map((l) => l.legNumber)) + 1
      : 1;
    setForm({ ...EMPTY_LEG, legNumber: String(nextLegNum) });
    setDialogOpen(true);
  };

  const openEditLeg = (leg: Leg) => {
    setForm({
      id: leg.id,
      legNumber: String(leg.legNumber),
      legType: leg.legType,
      originText: leg.originText ?? "",
      destinationText: leg.destinationText ?? "",
      scheduledStart: leg.scheduledStart?.slice(0, 16) ?? "",
      scheduledEnd: leg.scheduledEnd?.slice(0, 16) ?? "",
      pickupWindowStart: leg.pickupWindowStart?.slice(0, 16) ?? "",
      pickupWindowEnd: leg.pickupWindowEnd?.slice(0, 16) ?? "",
      dropoffWindowStart: leg.dropoffWindowStart?.slice(0, 16) ?? "",
      dropoffWindowEnd: leg.dropoffWindowEnd?.slice(0, 16) ?? "",
      requiredVehicleClass: leg.requiredVehicleClass ?? "",
      estimatedDistanceKm: leg.estimatedDistanceKm ?? "",
      estimatedDurationMinutes: leg.estimatedDurationMinutes != null
        ? String(leg.estimatedDurationMinutes) : "",
      status: leg.status,
      notes: leg.notes ?? "",
    });
    setDialogOpen(true);
  };

  const saveLeg = async () => {
    if (!form.legNumber) {
      toast({ variant: "destructive", title: "ترتيب المرحلة مطلوب" });
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        legNumber: Number(form.legNumber),
        legType: form.legType,
      };
      if (form.originText.trim()) body.originText = form.originText.trim();
      if (form.destinationText.trim()) body.destinationText = form.destinationText.trim();
      if (form.scheduledStart) body.scheduledStart = form.scheduledStart;
      if (form.scheduledEnd) body.scheduledEnd = form.scheduledEnd;
      if (form.pickupWindowStart) body.pickupWindowStart = form.pickupWindowStart;
      if (form.pickupWindowEnd) body.pickupWindowEnd = form.pickupWindowEnd;
      if (form.dropoffWindowStart) body.dropoffWindowStart = form.dropoffWindowStart;
      if (form.dropoffWindowEnd) body.dropoffWindowEnd = form.dropoffWindowEnd;
      if (form.requiredVehicleClass.trim()) body.requiredVehicleClass = form.requiredVehicleClass.trim();
      if (form.estimatedDistanceKm) body.estimatedDistanceKm = Number(form.estimatedDistanceKm);
      if (form.estimatedDurationMinutes) body.estimatedDurationMinutes = Number(form.estimatedDurationMinutes);
      if (form.notes.trim()) body.notes = form.notes.trim();
      if (form.id) body.status = form.status;

      if (form.id) {
        await apiFetch(`/transport/itineraries/${id}/legs/${form.id}`, {
          method: "PATCH", body: JSON.stringify(body),
        });
        toast({ title: "تم تحديث المرحلة" });
      } else {
        await apiFetch(`/transport/itineraries/${id}/legs`, {
          method: "POST", body: JSON.stringify(body),
        });
        toast({ title: "تمت إضافة المرحلة" });
      }
      qc.invalidateQueries({ queryKey });
      setDialogOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر الحفظ", description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const removeLeg = async (leg: Leg) => {
    if (!confirm(`حذف المرحلة #${leg.legNumber}؟`)) return;
    try {
      await apiFetch(`/transport/itineraries/${id}/legs/${leg.id}`, {
        method: "DELETE",
      });
      toast({ title: "تم الحذف" });
      qc.invalidateQueries({ queryKey });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر الحذف", description: message });
    }
  };

  const removeItinerary = async () => {
    if (!confirm("حذف البرنامج كله؟ سيتم حذف كل مراحله.")) return;
    try {
      await apiFetch(`/transport/itineraries/${id}`, { method: "DELETE" });
      toast({ title: "تم حذف البرنامج" });
      navigate("/fleet/transport/itineraries");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر الحذف", description: message });
    }
  };

  const sortedLegs = [...it.legs].sort((a, b) => a.legNumber - b.legNumber);

  return (
    <PageShell
      title={it.itineraryName}
      subtitle={`برنامج نقل — ${it.legs.length} مرحلة`}
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/transport/itineraries", label: "برامج النقل" },
        { label: it.itineraryName },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
          <Button variant="outline" size="sm" onClick={removeItinerary} className="text-rose-600">
            <Trash2 className="h-4 w-4 me-1" />حذف البرنامج
          </Button>
          <Link href="/fleet/transport/itineraries">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 me-1" />العودة
            </Button>
          </Link>
        </div>
      }
    >
      <Card className="mt-2">
        <CardContent className="p-3 text-xs flex items-center gap-4 flex-wrap">
          <Badge variant="outline">{it.status}</Badge>
          <span>النوع: {it.transportServiceType}</span>
          {it.umrahGroupId && <span>مجموعة عمرة #{it.umrahGroupId}</span>}
          {it.customerId && <span>عميل #{it.customerId}</span>}
          {it.startsAt && <span><Calendar className="h-3 w-3 inline" /> {new Date(it.startsAt).toLocaleString("ar")}</span>}
          {it.notes && <span className="text-muted-foreground">{it.notes}</span>}
        </CardContent>
      </Card>

      <Card className="mt-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>مراحل البرنامج</span>
            <Button size="sm" onClick={openCreateLeg} rateLimitAware>
              <Plus className="h-4 w-4 me-1" />مرحلة جديدة
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-2">
          {sortedLegs.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              لا توجد مراحل بعد. أضف المراحل بالترتيب (مثلاً 1، 2، 3) لتصف المسار التشغيلي.
            </div>
          ) : (
            sortedLegs.map((leg, idx) => (
              <div key={leg.id} className="p-3 rounded-md border bg-surface-subtle">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">#{leg.legNumber}</Badge>
                    <span className="text-sm font-medium">{legTypeLabel(leg.legType)}</span>
                    <Badge className={LEG_STATUS_TONE[leg.status]}>
                      {legStatusLabel(leg.status)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setSuggestLegId(leg.id)}
                      title="اقترح المركبة والسائق"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditLeg(leg)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => removeLeg(leg)} className="text-rose-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="text-xs space-y-1">
                  {(leg.originText || leg.destinationText) && (
                    <div className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      {leg.originText ?? "—"} <span className="text-muted-foreground">→</span> {leg.destinationText ?? "—"}
                    </div>
                  )}
                  {(leg.scheduledStart || leg.scheduledEnd) && (
                    <div className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      {leg.scheduledStart ? new Date(leg.scheduledStart).toLocaleString("ar") : "—"}
                      {" → "}
                      {leg.scheduledEnd ? new Date(leg.scheduledEnd).toLocaleString("ar") : "—"}
                    </div>
                  )}
                  {(leg.estimatedDistanceKm || leg.estimatedDurationMinutes) && (
                    <div className="inline-flex items-center gap-3 text-muted-foreground">
                      {leg.estimatedDistanceKm && <span>{leg.estimatedDistanceKm} كم</span>}
                      {leg.estimatedDurationMinutes != null && (
                        <span>{leg.estimatedDurationMinutes} دقيقة</span>
                      )}
                    </div>
                  )}
                  {(leg.assignedVehicleId || leg.assignedDriverId) && (
                    <div className="inline-flex items-center gap-3 text-muted-foreground">
                      {leg.assignedVehicleId && (
                        <span className="inline-flex items-center gap-1">
                          <Truck className="h-3 w-3" />مركبة #{leg.assignedVehicleId}
                        </span>
                      )}
                      {leg.assignedDriverId && <span>سائق #{leg.assignedDriverId}</span>}
                    </div>
                  )}
                  {leg.requiredVehicleClass && (
                    <div className="text-muted-foreground">
                      الفئة المطلوبة: {leg.requiredVehicleClass}
                    </div>
                  )}
                  {leg.notes && <div className="text-muted-foreground">{leg.notes}</div>}
                </div>
                {idx < sortedLegs.length - 1 && (
                  <div className="text-center text-[10px] text-muted-foreground mt-2">↓</div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "تعديل المرحلة" : "مرحلة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>ترتيب المرحلة *</Label>
                <Input
                  type="number" min="1"
                  value={form.legNumber}
                  onChange={(e) => setForm({ ...form, legNumber: e.target.value })}
                />
              </div>
              <div>
                <Label>نوع المرحلة</Label>
                <Select value={form.legType} onValueChange={(v) => setForm({ ...form, legType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEG_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>من</Label>
                <Input
                  value={form.originText}
                  onChange={(e) => setForm({ ...form, originText: e.target.value })}
                />
              </div>
              <div>
                <Label>إلى</Label>
                <Input
                  value={form.destinationText}
                  onChange={(e) => setForm({ ...form, destinationText: e.target.value })}
                />
              </div>
              <div>
                <Label>بداية مجدولة</Label>
                <Input
                  type="datetime-local"
                  value={form.scheduledStart}
                  onChange={(e) => setForm({ ...form, scheduledStart: e.target.value })}
                />
              </div>
              <div>
                <Label>نهاية مجدولة</Label>
                <Input
                  type="datetime-local"
                  value={form.scheduledEnd}
                  onChange={(e) => setForm({ ...form, scheduledEnd: e.target.value })}
                />
              </div>
              <div>
                <Label>فئة المركبة المطلوبة</Label>
                <Input
                  value={form.requiredVehicleClass}
                  onChange={(e) => setForm({ ...form, requiredVehicleClass: e.target.value })}
                />
              </div>
              {form.id && (
                <div>
                  <Label>الحالة</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEG_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>المسافة المقدّرة (كم)</Label>
                <Input
                  type="number" step="0.1"
                  value={form.estimatedDistanceKm}
                  onChange={(e) => setForm({ ...form, estimatedDistanceKm: e.target.value })}
                />
              </div>
              <div>
                <Label>المدة المقدّرة (دقيقة)</Label>
                <Input
                  type="number"
                  value={form.estimatedDurationMinutes}
                  onChange={(e) => setForm({ ...form, estimatedDurationMinutes: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>ملاحظات</Label>
                <Textarea
                  value={form.notes} rows={2}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={saveLeg} disabled={submitting} rateLimitAware>
              {submitting ? "جاري الحفظ…" : form.id ? "حفظ" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {suggestLegId != null && it.id && (
        <AssignmentSuggestDialog
          source={{ kind: "leg", itineraryId: it.id, legId: suggestLegId }}
          open={suggestLegId != null}
          onOpenChange={(o) => { if (!o) setSuggestLegId(null); }}
          onSelect={() => { qc.invalidateQueries({ queryKey }); setSuggestLegId(null); }}
        />
      )}
    </PageShell>
  );
}
