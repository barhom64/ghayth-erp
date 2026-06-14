/**
 * Vehicle Capability Matrix form — #2079 TA-T18-05.
 *
 * UI-only client change using the existing PATCH /fleet/vehicles/:id
 * endpoint (no backend or runtime engine change). Lets operators edit
 * the 19 technical fields + the 3 VCM canon fields that drive Gate-
 * PE-1's eligibility, with a completeness badge that mirrors the
 * server's safety-field calculation (11 of the 19).
 *
 * The component is intentionally extracted from vehicle-detail.tsx
 * so the same form can later be reused by the vehicle create flow
 * (TA-T18-05 follow-up) without duplicating the strict typing rules.
 *
 * Strict payload sanitization (owner's mandate):
 *   • numbers: empty string → null (never 0).
 *   • booleans: explicit true / false / null (no string passthrough).
 *   • vehicleServiceTypes: array of canonical service-type strings.
 *   • safetyFeatures: parsed JSON array only; invalid JSON disables save.
 *
 * Any malformed value is rejected on the client; the server's zod
 * schema is the second line of defence.
 */

import { useState, useMemo } from "react";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  computeVcmCompleteness,
  vcmTone,
  VCM_MIN_COMPLETENESS,
  VCM_SAFETY_FIELDS,
} from "@/lib/vcm-completeness";
import { cn } from "@/lib/utils";

// Vehicle service types — kept in sync with the server enum (CHECK
// constraint on `vehicleServiceTypes` from migration 315).
const SERVICE_TYPES = [
  { value: "cargo_load",         label: "نقل حمولة" },
  { value: "passenger_umrah",    label: "ركاب عمرة" },
  { value: "passenger_general",  label: "ركاب عام" },
  { value: "equipment_rental",   label: "تأجير معدّات" },
  { value: "internal_transfer",  label: "نقل داخلي" },
  { value: "other",              label: "أخرى" },
] as const;

const TRANSMISSION = [
  { value: "manual", label: "يدوي" },
  { value: "automatic", label: "أوتوماتيك" },
  { value: "amt", label: "AMT" },
  { value: "cvt", label: "CVT" },
];

const FUEL_TYPES = [
  { value: "gasoline", label: "بنزين" },
  { value: "diesel", label: "ديزل" },
  { value: "electric", label: "كهربائي" },
  { value: "hybrid", label: "هجين" },
  { value: "lpg", label: "غاز LPG" },
];

const UPHOLSTERY = [
  { value: "fabric", label: "قماش" },
  { value: "leather", label: "جلد" },
  { value: "premium", label: "فاخر" },
];

const VEHICLE_TYPES = [
  { value: "truck", label: "شاحنة" },
  { value: "bus", label: "حافلة" },
  { value: "van", label: "فان" },
  { value: "pickup", label: "بيك أب" },
  { value: "sedan", label: "سيدان" },
  { value: "trailer", label: "مقطورة" },
  { value: "equipment", label: "معدّات" },
];

export interface VehicleVcm {
  // technical profile (262)
  vehicleType?: string | null;
  payloadKg?: number | string | null;
  boxLengthCm?: number | null;
  boxWidthCm?: number | null;
  boxHeightCm?: number | null;
  axleCount?: number | null;
  tireCount?: number | null;
  tireSize?: string | null;
  engineDisplacementCc?: number | null;
  transmissionType?: string | null;
  fuelType?: string | null;
  seatCount?: number | null;
  hasAc?: boolean | null;
  screenCount?: number | null;
  doorCount?: number | null;
  upholsteryType?: string | null;
  safetyFeatures?: string[] | null;
  operatingHours?: number | string | null;
  equipmentAttachments?: string[] | null;
  // assignment-decision (284 + 315)
  operationalPayloadKg?: number | string | null;
  validForPassengers?: boolean | null;
  validForCargo?: boolean | null;
  operationalPassengerCapacity?: number | string | null;
  vehicleServiceTypes?: string[] | null;
}

interface Props {
  vehicleId: number | string;
  initial: VehicleVcm;
  /** UI gates the save controls — pass through fleet.vehicles:update.
   *  When false the form is read-only. */
  canEdit: boolean;
  /** Fired after a successful PATCH so the parent can invalidate
   *  its query. The component does NOT manage its own refresh. */
  onSaved?: () => void;
}

/** Empty string / null / undefined → null. Anything else → Number(v). */
function numOrNull(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function VehicleCapabilityMatrixForm({ vehicleId, initial, canEdit, onSaved }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState<VehicleVcm>(initial);
  const [busy, setBusy] = useState(false);
  // safetyFeatures + equipmentAttachments are jsonb arrays; the user
  // edits them as JSON text in a textarea. We keep the raw text in
  // state so we can validate before sending the payload.
  const [safetyText, setSafetyText] = useState(
    JSON.stringify(initial.safetyFeatures ?? [], null, 2),
  );
  const [equipmentText, setEquipmentText] = useState(
    JSON.stringify(initial.equipmentAttachments ?? [], null, 2),
  );

  const { safetyValid, safetyParsed } = useMemo(() => {
    try {
      const v = JSON.parse(safetyText);
      if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
        return { safetyValid: true, safetyParsed: v as string[] };
      }
      return { safetyValid: false, safetyParsed: null as string[] | null };
    } catch {
      return { safetyValid: false, safetyParsed: null as string[] | null };
    }
  }, [safetyText]);

  const { equipmentValid, equipmentParsed } = useMemo(() => {
    try {
      const v = JSON.parse(equipmentText);
      if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
        return { equipmentValid: true, equipmentParsed: v as string[] };
      }
      return { equipmentValid: false, equipmentParsed: null as string[] | null };
    } catch {
      return { equipmentValid: false, equipmentParsed: null as string[] | null };
    }
  }, [equipmentText]);

  // Completeness reflects ONLY the safety subset the server scores
  // (11 of the 19 editable fields). The text under the badge makes
  // that explicit so the operator doesn't misread the percentage.
  const completeness = useMemo(() => computeVcmCompleteness(form as Record<string, unknown>), [form]);
  const tone = vcmTone(completeness);
  const toneClass = tone === "red"
    ? "bg-status-error-surface text-status-error-foreground border-status-error-surface"
    : tone === "amber"
      ? "bg-status-warning-surface text-status-warning-foreground border-status-warning-surface"
      : "bg-status-success-surface text-status-success-foreground border-status-success-surface";
  const toneLabel = tone === "red"
    ? `ناقص — أقل من ${VCM_MIN_COMPLETENESS}٪`
    : tone === "amber" ? "مقبول" : "مكتمل";

  const setField = <K extends keyof VehicleVcm>(k: K, v: VehicleVcm[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const save = async () => {
    if (!safetyValid || !equipmentValid) {
      toast({
        variant: "destructive",
        title: "تحقّق من تنسيق JSON",
        description: "حقول الميزات/الملحقات يجب أن تكون مصفوفة نصوص JSON صحيحة.",
      });
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        vehicleType: form.vehicleType || null,
        payloadKg: numOrNull(form.payloadKg),
        boxLengthCm: numOrNull(form.boxLengthCm),
        boxWidthCm: numOrNull(form.boxWidthCm),
        boxHeightCm: numOrNull(form.boxHeightCm),
        axleCount: numOrNull(form.axleCount),
        tireCount: numOrNull(form.tireCount),
        tireSize: form.tireSize || null,
        engineDisplacementCc: numOrNull(form.engineDisplacementCc),
        transmissionType: form.transmissionType || null,
        fuelType: form.fuelType || null,
        seatCount: numOrNull(form.seatCount),
        hasAc: form.hasAc ?? null,
        screenCount: numOrNull(form.screenCount),
        doorCount: numOrNull(form.doorCount),
        upholsteryType: form.upholsteryType || null,
        safetyFeatures: safetyParsed,
        operatingHours: numOrNull(form.operatingHours),
        equipmentAttachments: equipmentParsed,
        operationalPayloadKg: numOrNull(form.operationalPayloadKg),
        validForPassengers: form.validForPassengers ?? null,
        validForCargo: form.validForCargo ?? null,
        operationalPassengerCapacity: numOrNull(form.operationalPassengerCapacity),
        vehicleServiceTypes: form.vehicleServiceTypes && form.vehicleServiceTypes.length > 0
          ? form.vehicleServiceTypes
          : null,
      };
      await apiFetch(`/fleet/vehicles/${vehicleId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      toast({ title: "تم حفظ الملف الفني" });
      onSaved?.();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "تعذّر الحفظ",
        description: getErrorMessage(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const disabled = !canEdit;
  const toggleService = (svc: string) => {
    if (disabled) return;
    const current = form.vehicleServiceTypes ?? [];
    setField(
      "vehicleServiceTypes",
      current.includes(svc) ? current.filter((s) => s !== svc) : [...current, svc],
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">الملف الفني / Capability Matrix</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("text-xs", toneClass)}>
            {completeness}٪ — {toneLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-[11px] text-muted-foreground -mt-2">
          النسبة مبنية على {VCM_SAFETY_FIELDS.length} حقلًا من «حقول السلامة/الاكتمال
          المعتمدة في محرّك الإسناد» — وهي ما يستخدمه Gate-PE-1 لقبول/إقصاء المركبة.
          باقي الحقول قابلة للتحرير ولكنها لا تؤثّر مباشرة على نسبة التأهيل.
        </p>

        {/* Canon block (the 3 fields VCM gate reads first) */}
        <section className="space-y-3">
          <h4 className="text-sm font-semibold">canon — قرار التأهيل</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FieldSelect label="النوع" value={form.vehicleType ?? ""} onChange={(v) => setField("vehicleType", v || null)} options={VEHICLE_TYPES} disabled={disabled} />
            <FieldSwitch label="صالحة للركاب" value={form.validForPassengers ?? null} onChange={(v) => setField("validForPassengers", v)} disabled={disabled} />
            <FieldSwitch label="صالحة للحمولة" value={form.validForCargo ?? null} onChange={(v) => setField("validForCargo", v)} disabled={disabled} />
          </div>
          <div>
            <Label className="text-xs">أنواع الخدمة المعتمدة (vehicleServiceTypes)</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {SERVICE_TYPES.map((s) => {
                const on = (form.vehicleServiceTypes ?? []).includes(s.value);
                return (
                  <Badge
                    key={s.value}
                    variant={on ? "default" : "outline"}
                    className={cn("cursor-pointer", disabled && "opacity-60 cursor-not-allowed")}
                    onClick={() => toggleService(s.value)}
                  >
                    {s.label}
                  </Badge>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              فارغ = الفلتر معطَّل (تعتمد الأهلية على validFor* فقط).
            </p>
          </div>
        </section>

        {/* Cargo group */}
        <section className="space-y-3">
          <h4 className="text-sm font-semibold">شحن</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FieldNumber label="payloadKg (إسمي)" value={form.payloadKg} onChange={(v) => setField("payloadKg", v)} disabled={disabled} />
            <FieldNumber label="operationalPayloadKg (آمن)" value={form.operationalPayloadKg} onChange={(v) => setField("operationalPayloadKg", v)} disabled={disabled} />
            <FieldNumber label="عدد المحاور" value={form.axleCount} onChange={(v) => setField("axleCount", v == null ? null : Math.trunc(Number(v)))} disabled={disabled} />
            <FieldNumber label="عدد الإطارات" value={form.tireCount} onChange={(v) => setField("tireCount", v == null ? null : Math.trunc(Number(v)))} disabled={disabled} />
            <FieldText label="مقاس الإطار" value={form.tireSize ?? ""} onChange={(v) => setField("tireSize", v || null)} disabled={disabled} />
            <FieldNumber label="طول الصندوق (سم)" value={form.boxLengthCm} onChange={(v) => setField("boxLengthCm", v == null ? null : Math.trunc(Number(v)))} disabled={disabled} />
            <FieldNumber label="عرض الصندوق (سم)" value={form.boxWidthCm} onChange={(v) => setField("boxWidthCm", v == null ? null : Math.trunc(Number(v)))} disabled={disabled} />
            <FieldNumber label="ارتفاع الصندوق (سم)" value={form.boxHeightCm} onChange={(v) => setField("boxHeightCm", v == null ? null : Math.trunc(Number(v)))} disabled={disabled} />
          </div>
        </section>

        {/* Powertrain group */}
        <section className="space-y-3">
          <h4 className="text-sm font-semibold">المحرّك</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FieldNumber label="سعة المحرّك (cc)" value={form.engineDisplacementCc} onChange={(v) => setField("engineDisplacementCc", v == null ? null : Math.trunc(Number(v)))} disabled={disabled} />
            <FieldSelect label="ناقل الحركة" value={form.transmissionType ?? ""} onChange={(v) => setField("transmissionType", v || null)} options={TRANSMISSION} disabled={disabled} />
            <FieldSelect label="نوع الوقود" value={form.fuelType ?? ""} onChange={(v) => setField("fuelType", v || null)} options={FUEL_TYPES} disabled={disabled} />
          </div>
        </section>

        {/* Passenger group */}
        <section className="space-y-3">
          <h4 className="text-sm font-semibold">ركاب</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FieldNumber label="عدد المقاعد (إسمي)" value={form.seatCount} onChange={(v) => setField("seatCount", v == null ? null : Math.trunc(Number(v)))} disabled={disabled} />
            <FieldNumber label="السعة التشغيلية للركاب" value={form.operationalPassengerCapacity} onChange={(v) => setField("operationalPassengerCapacity", v)} disabled={disabled} />
            <FieldSwitch label="مكيّف" value={form.hasAc ?? null} onChange={(v) => setField("hasAc", v)} disabled={disabled} />
            <FieldNumber label="عدد الشاشات" value={form.screenCount} onChange={(v) => setField("screenCount", v == null ? null : Math.trunc(Number(v)))} disabled={disabled} />
            <FieldNumber label="عدد الأبواب" value={form.doorCount} onChange={(v) => setField("doorCount", v == null ? null : Math.trunc(Number(v)))} disabled={disabled} />
            <FieldSelect label="نوع التنجيد" value={form.upholsteryType ?? ""} onChange={(v) => setField("upholsteryType", v || null)} options={UPHOLSTERY} disabled={disabled} />
          </div>
          <div>
            <Label className="text-xs">ميزات السلامة (JSON array)</Label>
            <textarea
              value={safetyText}
              onChange={(e) => setSafetyText(e.target.value)}
              disabled={disabled}
              rows={3}
              className={cn(
                "w-full rounded border px-2 py-1.5 text-xs font-mono",
                safetyValid ? "border-border" : "border-status-error-surface",
              )}
              placeholder='["abs","airbag","seatbelt","camera"]'
            />
            {!safetyValid && (
              <p className="text-[10px] text-status-error-foreground mt-1">
                JSON غير صالح — يجب أن يكون مصفوفة نصوص.
              </p>
            )}
          </div>
        </section>

        {/* Equipment group */}
        <section className="space-y-3">
          <h4 className="text-sm font-semibold">معدّات (إن انطبق)</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FieldNumber label="ساعات التشغيل" value={form.operatingHours} onChange={(v) => setField("operatingHours", v)} disabled={disabled} />
            <div className="md:col-span-2">
              <Label className="text-xs">الملحقات (JSON array)</Label>
              <textarea
                value={equipmentText}
                onChange={(e) => setEquipmentText(e.target.value)}
                disabled={disabled}
                rows={2}
                className={cn(
                  "w-full rounded border px-2 py-1.5 text-xs font-mono",
                  equipmentValid ? "border-border" : "border-status-error-surface",
                )}
                placeholder='["bucket","hammer","ripper"]'
              />
              {!equipmentValid && (
                <p className="text-[10px] text-status-error-foreground mt-1">
                  JSON غير صالح — يجب أن يكون مصفوفة نصوص.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Save bar (gated by canEdit) */}
        {canEdit && (
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button onClick={save} disabled={busy || !safetyValid || !equipmentValid}>
              {busy ? "جاري الحفظ…" : "حفظ الملف الفني"}
            </Button>
          </div>
        )}
        {!canEdit && (
          <p className="text-[11px] text-muted-foreground border-t pt-3">
            لا تملك صلاحية تعديل الملف الفني (fleet.vehicles:update).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Inline field helpers ───────────────────────────────────── */

function FieldText(p: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <Label className="text-xs">{p.label}</Label>
      <Input value={p.value} onChange={(e) => p.onChange(e.target.value)} disabled={p.disabled} />
    </div>
  );
}

function FieldNumber(p: { label: string; value: number | string | null | undefined; onChange: (v: string | null) => void; disabled?: boolean }) {
  return (
    <div>
      <Label className="text-xs">{p.label}</Label>
      <Input
        type="number"
        inputMode="decimal"
        value={p.value == null ? "" : String(p.value)}
        onChange={(e) => p.onChange(e.target.value === "" ? null : e.target.value)}
        disabled={p.disabled}
        placeholder="—"
      />
    </div>
  );
}

function FieldSelect(p: { label: string; value: string; onChange: (v: string) => void; options: ReadonlyArray<{ value: string; label: string }>; disabled?: boolean }) {
  return (
    <div>
      <Label className="text-xs">{p.label}</Label>
      <Select value={p.value} onValueChange={(v) => p.onChange(v === "__none__" ? "" : v)} disabled={p.disabled}>
        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— غير محدّد —</SelectItem>
          {p.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FieldSwitch(p: { label: string; value: boolean | null; onChange: (v: boolean | null) => void; disabled?: boolean }) {
  // Three-state: null (غير محدّد) / true (نعم) / false (لا).
  // null is the legacy default; the user has to click once to leave it.
  const next = (cur: boolean | null): boolean | null =>
    cur === null ? true : cur === true ? false : null;
  const text = p.value === null ? "غير محدّد" : p.value ? "نعم" : "لا";
  return (
    <div>
      <Label className="text-xs">{p.label}</Label>
      <div className="flex items-center gap-2 pt-1.5">
        <Switch
          checked={p.value === true}
          onCheckedChange={() => p.onChange(next(p.value))}
          disabled={p.disabled}
        />
        <span className="text-xs text-muted-foreground">{text}</span>
      </div>
    </div>
  );
}
