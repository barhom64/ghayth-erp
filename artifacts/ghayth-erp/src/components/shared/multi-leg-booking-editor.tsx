import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DateField } from "@/components/shared/form-field-wrapper";
import { Plus, Trash2, ArrowDown, ArrowUp } from "lucide-react";
import { ROUTE_TYPES } from "@/lib/transport-constants";

// #1812 operational review — closes the user's #1 explicit gap:
//   "لا يوجد Multi-leg Booking. الواقع التشغيلي: مطار جدة ↓ فندق مكة
//    ↓ الحرم ↓ المدينة ↓ الفندق ↓ المطار."
//
// Each "leg" maps to a transport_booking_lines row. The editor lets
// the operator append legs, edit them inline, reorder them up/down,
// and delete them. On submit, the parent form POSTs the whole array
// inside the booking-create payload as `lines: []` — the server
// inserts them atomically inside withTransaction (so any leg
// validation failure rolls back the booking header too).
//
// Each leg carries: from / to (freeform text + categorical kind),
// pickup / dropoff timestamps, passenger count, and an optional
// per-leg route type (so leg 1 can be airport_to_makkah and leg 3
// can be makkah_to_madinah without forcing a single header value).

export interface BookingLeg {
  fromText: string;
  toText: string;
  fromKind?: string;
  toKind?: string;
  scheduledPickupAt?: string;
  scheduledDeliveryAt?: string;
  passengerCount?: string;
  legRouteType?: string;
  notes?: string;
}

export const EMPTY_LEG: BookingLeg = {
  fromText: "", toText: "",
  fromKind: undefined, toKind: undefined,
  scheduledPickupAt: "", scheduledDeliveryAt: "",
  passengerCount: "", legRouteType: undefined, notes: "",
};

const LOCATION_KINDS: { value: string; label: string }[] = [
  { value: "airport",       label: "مطار" },
  { value: "gate",          label: "بوابة" },
  { value: "hotel",         label: "فندق" },
  { value: "mazar",         label: "مزار" },
  { value: "warehouse",     label: "مستودع" },
  { value: "project",       label: "مشروع" },
  { value: "customer_site", label: "موقع عميل" },
  { value: "depot",         label: "مستودع تشغيلي" },
  { value: "mosque",        label: "مسجد" },
  { value: "other",         label: "أخرى" },
];

// ROUTE_TYPES مُوحَّد في "@/lib/transport-constants" (UX-05 — كان مكرّرًا حرفيًا).

// Common umrah template — clicking it appends 6 standard legs.
const UMRAH_TEMPLATE: BookingLeg[] = [
  { ...EMPTY_LEG, fromText: "مطار جدة الدولي",  toText: "فندق مكة",     fromKind: "airport", toKind: "hotel",  legRouteType: "airport_to_makkah" },
  { ...EMPTY_LEG, fromText: "فندق مكة",           toText: "الحرم المكي",   fromKind: "hotel",   toKind: "mosque", legRouteType: "makkah_local" },
  { ...EMPTY_LEG, fromText: "الحرم المكي",         toText: "فندق مكة",      fromKind: "mosque",  toKind: "hotel",  legRouteType: "makkah_local" },
  { ...EMPTY_LEG, fromText: "فندق مكة",           toText: "فندق المدينة",  fromKind: "hotel",   toKind: "hotel",  legRouteType: "makkah_to_madinah" },
  { ...EMPTY_LEG, fromText: "فندق المدينة",       toText: "المسجد النبوي", fromKind: "hotel",   toKind: "mosque", legRouteType: "madinah_local" },
  { ...EMPTY_LEG, fromText: "فندق المدينة",       toText: "مطار المدينة",  fromKind: "hotel",   toKind: "airport", legRouteType: "madinah_to_airport" },
];

interface Props {
  legs: BookingLeg[];
  onChange: (legs: BookingLeg[]) => void;
}

export function MultiLegBookingEditor({ legs, onChange }: Props) {
  const update = (idx: number, patch: Partial<BookingLeg>) => {
    onChange(legs.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const append = () => onChange([...legs, { ...EMPTY_LEG }]);
  const remove = (idx: number) => onChange(legs.filter((_, i) => i !== idx));
  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= legs.length) return;
    const next = [...legs];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };
  const loadUmrahTemplate = () => onChange([...legs, ...UMRAH_TEMPLATE]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">
          مقاطع المسار ({legs.length})
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={loadUmrahTemplate}>
            قالب عمرة (6 مقاطع)
          </Button>
          <Button type="button" size="sm" onClick={append} rateLimitAware>
            <Plus className="h-4 w-4 ml-1" />
            مقطع جديد
          </Button>
        </div>
      </div>

      {legs.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            لم تُضَف مقاطع بعد. أضف مقطعاً واحداً على الأقل لرحلة بسيطة،
            أو استخدم قالب العمرة للحصول على 6 مقاطع جاهزة.
          </CardContent>
        </Card>
      )}

      {legs.map((leg, idx) => (
        <Card key={idx} className="border-2 border-l-4 border-l-status-info-foreground">
          <CardContent className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-mono bg-surface-subtle px-2 py-0.5 rounded">
                المقطع {idx + 1} من {legs.length}
              </div>
              <div className="flex gap-1">
                <Button
                  type="button" size="sm" variant="ghost"
                  disabled={idx === 0}
                  onClick={() => move(idx, -1)}
                  aria-label="نقل للأعلى"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button" size="sm" variant="ghost"
                  disabled={idx === legs.length - 1}
                  onClick={() => move(idx, 1)}
                  aria-label="نقل للأسفل"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button" size="sm" variant="ghost"
                  className="text-rose-600 hover:text-rose-700"
                  onClick={() => remove(idx)}
                  aria-label="حذف المقطع"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">من</Label>
                <Input
                  value={leg.fromText}
                  onChange={(e) => update(idx, { fromText: e.target.value })}
                  placeholder="نقطة الانطلاق"
                />
                <Select
                  value={leg.fromKind ?? ""}
                  onValueChange={(v) => update(idx, { fromKind: v || undefined })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="نوع موقع الانطلاق" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATION_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">إلى</Label>
                <Input
                  value={leg.toText}
                  onChange={(e) => update(idx, { toText: e.target.value })}
                  placeholder="نقطة الوصول"
                />
                <Select
                  value={leg.toKind ?? ""}
                  onValueChange={(v) => update(idx, { toKind: v || undefined })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="نوع موقع الوصول" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATION_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DateField
                label="وقت الانطلاق"
                mode="datetime"
                value={leg.scheduledPickupAt ?? ""}
                onChange={(v) => update(idx, { scheduledPickupAt: v })}
              />
              <DateField
                label="وقت الوصول"
                mode="datetime"
                value={leg.scheduledDeliveryAt ?? ""}
                onChange={(v) => update(idx, { scheduledDeliveryAt: v })}
              />

              <div>
                <Label className="text-xs">عدد الركاب</Label>
                <Input
                  type="number" min="0"
                  value={leg.passengerCount ?? ""}
                  onChange={(e) => update(idx, { passengerCount: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">نوع المسار (عمرة)</Label>
                <Select
                  value={leg.legRouteType ?? ""}
                  onValueChange={(v) => update(idx, { legRouteType: v || undefined })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROUTE_TYPES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Helper used by the parent form to map editor state to API payload.
export function legsToApiPayload(legs: BookingLeg[]) {
  return legs.map((l) => ({
    fromLocationText: l.fromText?.trim() || undefined,
    toLocationText:   l.toText?.trim()   || undefined,
    fromLocationKind: l.fromKind,
    toLocationKind:   l.toKind,
    scheduledPickupAt:   l.scheduledPickupAt   || undefined,
    scheduledDeliveryAt: l.scheduledDeliveryAt || undefined,
    passengerCount: l.passengerCount ? Number(l.passengerCount) : undefined,
    legRouteType:   l.legRouteType,
    notes: l.notes?.trim() || undefined,
  }));
}
