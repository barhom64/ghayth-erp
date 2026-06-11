import { useState } from "react";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Activity, Weight, Coffee, ClipboardCheck, Flag,
  Fuel, Package as PackageIcon, MapPin, Save, ListChecks,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// #2079 TA-T18-03 — driver-side dialog for recording within-step
// operational checkpoints on a cargo manifest (weighbridge, rest
// break, inspection, customs, fueling, loading / unloading
// milestones). Backed by the endpoints landed in #2056:
//
//   POST /api/fleet/me/cargo/:id/checkpoint
//   GET  /api/fleet/me/cargo/:id/checkpoints
//
// The dialog NEVER changes the cargo manifest's 7-state lifecycle —
// the existing "advance" buttons on me-driver.tsx own that. Checkpoints
// are chronological facts the dispatcher renders on the cargo timeline.

export type CheckpointType =
  | "loading_start" | "loading_complete"
  | "weighing" | "rest_break" | "inspection"
  | "customs" | "fueling"
  | "unloading_start" | "unloading_complete"
  | "other";

const CHECKPOINT_OPTIONS: Array<{
  type: CheckpointType;
  label: string;
  unitLabel?: string;
  unit?: string;
  icon: typeof Weight;
}> = [
  { type: "loading_start",      label: "بدء التحميل",       icon: PackageIcon },
  { type: "loading_complete",   label: "اكتمال التحميل",    icon: PackageIcon },
  { type: "weighing",           label: "وزن في الميزان",    unitLabel: "الوزن (كغ)",    unit: "kg",    icon: Weight },
  { type: "rest_break",         label: "استراحة",           unitLabel: "المدة (دقائق)", unit: "min",   icon: Coffee },
  { type: "inspection",         label: "تفتيش",             icon: ClipboardCheck },
  { type: "customs",            label: "إجراءات جمركية",    icon: Flag },
  { type: "fueling",            label: "تزويد وقود",        unitLabel: "اللترات",       unit: "L",     icon: Fuel },
  { type: "unloading_start",    label: "بدء التفريغ",       unitLabel: "الوحدات",       unit: "units", icon: PackageIcon },
  { type: "unloading_complete", label: "اكتمال التفريغ",    unitLabel: "الوحدات",       unit: "units", icon: PackageIcon },
  { type: "other",              label: "حدث آخر",           icon: Activity },
];

const TYPE_LABEL_AR: Record<CheckpointType, string> =
  Object.fromEntries(CHECKPOINT_OPTIONS.map((o) => [o.type, o.label])) as Record<CheckpointType, string>;

interface CheckpointRow {
  id: number;
  checkpointType: CheckpointType;
  notes: string | null;
  latitude: string | null;
  longitude: string | null;
  measuredValue: string | null;
  measuredUnit: string | null;
  recordedAt: string;
}

interface Props {
  manifestId: number;
  manifestNumber: string;
  /** Disabled when the manifest is no longer in a driver-controlled
   *  state — matches the backend's CARGO_DRIVER_CHECKPOINT_OPEN_STATES gate. */
  disabled?: boolean;
}

export function CargoCheckpointDialog({ manifestId, manifestNumber, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<CheckpointType>("weighing");
  const [notes, setNotes] = useState("");
  const [measured, setMeasured] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  // Lazy: only fetch when the dialog is open so the cargo list page
  // doesn't issue N HTTP calls for N manifests on mount.
  const checkpointsQ = useApiQuery<{ data: CheckpointRow[] }>(
    ["fleet-me-cargo-checkpoints", String(manifestId)],
    open ? `/fleet/me/cargo/${manifestId}/checkpoints` : null,
    { enabled: open },
  );
  const rows = checkpointsQ.data?.data ?? [];

  const option = CHECKPOINT_OPTIONS.find((o) => o.type === type)!;

  const captureGps = () => {
    if (!navigator.geolocation) {
      toast({ variant: "destructive", title: "تتبع الموقع غير متاح على هذا الجهاز" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(7));
        setLng(pos.coords.longitude.toFixed(7));
      },
      (err) => {
        toast({ variant: "destructive", title: "تعذّر قراءة الموقع", description: err.message });
      },
      { enableHighAccuracy: true, timeout: 8_000 },
    );
  };

  const reset = () => {
    setType("weighing");
    setNotes("");
    setMeasured("");
    setLat("");
    setLng("");
  };

  const submit = async () => {
    setBusy(true);
    try {
      await apiFetch(`/fleet/me/cargo/${manifestId}/checkpoint`, {
        method: "POST",
        body: JSON.stringify({
          checkpointType: type,
          notes: notes.trim() || undefined,
          latitude:  lat ? Number(lat) : undefined,
          longitude: lng ? Number(lng) : undefined,
          measuredValue: measured ? Number(measured) : undefined,
          measuredUnit:  measured && option.unit ? option.unit : undefined,
        }),
      });
      toast({ title: "تم تسجيل نقطة التشغيل", description: option.label });
      reset();
      qc.invalidateQueries({ queryKey: ["fleet-me-cargo-checkpoints", String(manifestId)] });
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر التسجيل", description: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline" size="sm"
          className="w-full mt-2"
          disabled={disabled}
          title={disabled ? "غير متاح على بوليصة مغلقة" : undefined}
        >
          <ListChecks className="h-4 w-4 me-1" />نقاط التشغيل
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-mono">
            نقاط التشغيل · {manifestNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-48 overflow-y-auto -mx-2 px-2">
          {checkpointsQ.isLoading ? (
            <p className="text-xs text-muted-foreground py-3 text-center">جاري التحميل…</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">
              لا توجد نقاط تشغيل مسجَّلة بعد على هذه البوليصة.
            </p>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="rounded border p-2 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="outline" className="bg-status-info-surface text-status-info-foreground">
                    {TYPE_LABEL_AR[r.checkpointType] ?? r.checkpointType}
                  </Badge>
                  <span className="text-muted-foreground">
                    {new Date(r.recordedAt).toLocaleString("ar-SA")}
                  </span>
                </div>
                {(r.measuredValue || r.notes) && (
                  <p className="text-xs">
                    {r.measuredValue && (
                      <span className="font-mono me-2">
                        {r.measuredValue} {r.measuredUnit ?? ""}
                      </span>
                    )}
                    {r.notes}
                  </p>
                )}
                {(r.latitude && r.longitude) && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {Number(r.latitude).toFixed(4)}, {Number(r.longitude).toFixed(4)}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        <div className="border-t pt-3 space-y-2">
          <div>
            <Label className="text-xs">نوع النقطة</Label>
            <Select value={type} onValueChange={(v) => { setType(v as CheckpointType); setMeasured(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHECKPOINT_OPTIONS.map((o) => {
                  const Icon = o.icon;
                  return (
                    <SelectItem key={o.type} value={o.type}>
                      <span className="inline-flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" />{o.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {option.unitLabel && (
            <div>
              <Label className="text-xs">{option.unitLabel}</Label>
              <Input
                inputMode="decimal"
                value={measured}
                onChange={(e) => setMeasured(e.target.value)}
                placeholder="0"
              />
            </div>
          )}

          <div>
            <Label className="text-xs">ملاحظة (اختياري)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="مثلاً: ميزان جنوب المدينة، الإطارات سليمة…"
            />
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">الموقع</Label>
              <div className="text-xs font-mono bg-surface-subtle rounded px-2 py-1.5">
                {lat && lng ? `${lat}, ${lng}` : <span className="text-muted-foreground">— غير محدّد —</span>}
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={captureGps}>
              <MapPin className="h-4 w-4 me-1" />التقاط GPS
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={submit}
            disabled={busy || disabled}
            className="w-full"
          >
            <Save className="h-4 w-4 me-1" />
            {busy ? "جاري التسجيل…" : "سجِّل النقطة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
