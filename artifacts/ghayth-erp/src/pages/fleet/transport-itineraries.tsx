import { useState } from "react";
import { Link, useLocation } from "wouter";
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
  ArrowLeft, Plus, Pencil, Route, Calendar, MapPin,
} from "lucide-react";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";

// #1812 Comment 3 — سلسلة الرحلات. The user's example: "مكة → جدة →
// استقبال المدينة → الفندق". A single transport itinerary is a
// SEQUENCE of legs that share the customer + operational program;
// each leg can be assigned independently to a (vehicle, driver) but
// the planning engine respects the chain.
//
// This SPA is the admin surface for transport_itineraries +
// transport_itinerary_legs. Backend CRUD already shipped in
// transport-planning.ts (PR #1819).

const SERVICE_TYPES = [
  { value: "cargo_load", label: "نقل حمولة" },
  { value: "passenger_umrah", label: "نقل معتمرين" },
  { value: "passenger_general", label: "نقل ركاب" },
  { value: "equipment_rental", label: "تأجير معدة" },
  { value: "internal_transfer", label: "نقل داخلي" },
  { value: "other", label: "أخرى" },
] as const;

const STATUS_OPTIONS = [
  { value: "draft", label: "مسودة" },
  { value: "scheduled", label: "مجدول" },
  { value: "in_progress", label: "قيد التنفيذ" },
  { value: "completed", label: "مكتمل" },
  { value: "cancelled", label: "ملغى" },
] as const;

const STATUS_TONE: Record<string, string> = {
  draft: "bg-surface-subtle text-muted-foreground",
  scheduled: "bg-status-info-surface text-status-info-foreground",
  in_progress: "bg-status-warning-surface text-status-warning-foreground",
  completed: "bg-status-success-surface text-status-success-foreground",
  cancelled: "bg-rose-100 text-rose-700",
};

interface Itinerary {
  id: number;
  itineraryName: string;
  transportServiceType: string;
  customerId: number | null;
  umrahGroupId: number | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  notes: string | null;
}

interface FormState {
  id?: number;
  itineraryName: string;
  transportServiceType: string;
  customerId: string;
  umrahGroupId: string;
  startsAt: string;
  endsAt: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  itineraryName: "",
  transportServiceType: "passenger_umrah",
  customerId: "",
  umrahGroupId: "",
  startsAt: "",
  endsAt: "",
  notes: "",
};

function serviceLabel(v: string): string {
  return SERVICE_TYPES.find((s) => s.value === v)?.label ?? v;
}

function statusLabel(v: string): string {
  return STATUS_OPTIONS.find((s) => s.value === v)?.label ?? v;
}

export default function TransportItineraries() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const qsParts: string[] = [];
  if (statusFilter !== "all") qsParts.push(`status=${statusFilter}`);
  if (serviceFilter !== "all") qsParts.push(`serviceType=${serviceFilter}`);
  const qs = qsParts.length ? `?${qsParts.join("&")}` : "";

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: Itinerary[] }>(
    ["transport-itineraries", statusFilter, serviceFilter],
    `/transport/itineraries${qs}`,
  );
  const rows = data?.data ?? [];

  const queryKey = ["transport-itineraries", statusFilter, serviceFilter];

  const openCreate = () => { setForm(EMPTY_FORM); setDialogOpen(true); };

  const save = async () => {
    if (!form.itineraryName.trim()) {
      toast({ variant: "destructive", title: "اسم البرنامج مطلوب" });
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        itineraryName: form.itineraryName.trim(),
        transportServiceType: form.transportServiceType,
      };
      if (form.customerId) body.customerId = Number(form.customerId);
      if (form.umrahGroupId) body.umrahGroupId = Number(form.umrahGroupId);
      if (form.startsAt) body.startsAt = form.startsAt;
      if (form.endsAt) body.endsAt = form.endsAt;
      if (form.notes.trim()) body.notes = form.notes.trim();

      const res = await apiFetch<{ data: { id: number } }>(
        "/transport/itineraries",
        { method: "POST", body: JSON.stringify(body) },
      );
      const newId = res?.data?.id;
      toast({ title: "تم إنشاء البرنامج" });
      qc.invalidateQueries({ queryKey });
      setDialogOpen(false);
      if (newId) navigate(`/fleet/transport/itineraries/${newId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر الحفظ", description: message });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="برامج النقل (سلاسل الرحلات)"
      subtitle="إدارة سلاسل الرحلات المتعاقبة — كل برنامج يحوي مراحل متسلسلة (مثلاً مكة → المدينة → الفندق)"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/transport/bookings", label: "حجوزات النقل" },
        { label: "برامج النقل" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={openCreate} rateLimitAware>
            <Plus className="h-4 w-4 me-1" />برنامج جديد
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
            <Label className="text-xs text-muted-foreground">الحالة</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label className="text-xs text-muted-foreground">نوع الخدمة</Label>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                {SERVICE_TYPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
            <div className="text-xs text-muted-foreground ms-auto">{rows.length} برنامج</div>
          </div>

          {rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              لا توجد برامج نقل حالياً. أنشئ برنامجاً جديداً ثم أضف مراحله بالترتيب.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rows.map((it) => (
                <Link key={it.id} href={`/fleet/transport/itineraries/${it.id}`} asChild>
                  <a className="block p-3 rounded-md border hover:bg-surface-subtle">
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-2 font-medium">
                        <Route className="h-4 w-4 text-muted-foreground" />
                        {it.itineraryName}
                      </div>
                      <Badge variant="outline" className={STATUS_TONE[it.status]}>
                        {statusLabel(it.status)}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div>{serviceLabel(it.transportServiceType)}</div>
                      {(it.startsAt || it.endsAt) && (
                        <div className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {it.startsAt ? new Date(it.startsAt).toLocaleDateString("ar") : "—"}
                          {" → "}
                          {it.endsAt ? new Date(it.endsAt).toLocaleDateString("ar") : "—"}
                        </div>
                      )}
                      {it.umrahGroupId && <div>مجموعة عمرة #{it.umrahGroupId}</div>}
                      {it.customerId && <div>عميل #{it.customerId}</div>}
                    </div>
                  </a>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>برنامج نقل جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Label>اسم البرنامج *</Label>
                <Input
                  value={form.itineraryName}
                  onChange={(e) => setForm({ ...form, itineraryName: e.target.value })}
                  placeholder="مثلاً: برنامج عمرة شركة … رمضان 1448"
                />
              </div>
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
                />
              </div>
              <div>
                <Label>معرّف مجموعة العمرة (اختياري)</Label>
                <Input
                  type="number"
                  value={form.umrahGroupId}
                  onChange={(e) => setForm({ ...form, umrahGroupId: e.target.value })}
                />
              </div>
              <div>
                <Label>تاريخ البدء</Label>
                <Input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                />
              </div>
              <div>
                <Label>تاريخ الانتهاء</Label>
                <Input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>ملاحظات</Label>
                <Textarea
                  value={form.notes}
                  rows={2}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={save} disabled={submitting} rateLimitAware>
              {submitting ? "جاري الحفظ…" : "إنشاء + إضافة مراحل"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
