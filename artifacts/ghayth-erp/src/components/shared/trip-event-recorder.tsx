// مُسجِّل وقائع الرحلة المشترك (الكيان يقود التجربة / تسجيل واقعة).
//
// يُستعمل من سطحين بنفس المنطق، يختلف فقط الـendpoint:
//   • المشغّل: /transport/bookings/:id/events
//   • السائق:  /transport/dispatch-orders/:id/trip-event
// المستخدم يسجّل «ما حدث» + وزن (فارغ/محمّل) + إثبات (POD)؛ الخادم يشتقّ الحالة.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { TRIP_WEIGHT_KIND_LABEL } from "@/lib/trip-weight";

// تعريف الوقائع القابلة للتسجيل (الترتيب = تدفّق الرحلة الطبيعي).
export const TRIP_EVENT_DEFS: { type: string; label: string; closing?: boolean }[] = [
  { type: "load", label: "تحميل" },
  { type: "depart", label: "خروج من المصدر" },
  { type: "arrive", label: "وصول" },
  { type: "inspect", label: "فحص" },
  { type: "unload", label: "تفريغ", closing: true },
  { type: "deliver", label: "تسليم", closing: true },
];
export const TRIP_EVENT_LABEL: Record<string, string> = {
  ...Object.fromEntries(TRIP_EVENT_DEFS.map((e) => [e.type, e.label])),
  handover: "تسليم عهدة",
};
const TRIP_EVENT_CLOSING = new Set(["unload", "deliver"]);

interface TripEventRecorderProps {
  /** المسار الذي يستقبل الواقعة (يختلف بين سطح المشغّل والسائق). */
  endpoint: string;
  /** هل يجوز التسجيل الآن؟ (بوابة الحالة — يُمرّرها المُستضيف). */
  executable: boolean;
  /** رسالة تظهر حين لا يجوز التسجيل. */
  disabledHint?: string;
  /** يُستدعى بعد تسجيل ناجح (لإعادة الجلب). */
  onRecorded?: () => void;
}

export function TripEventRecorder({
  endpoint, executable, disabledHint, onRecorded,
}: TripEventRecorderProps) {
  const { toast } = useToast();
  const [activeEvent, setActiveEvent] = useState<string | null>(null);
  const [eventNotes, setEventNotes] = useState("");
  const [eventWeight, setEventWeight] = useState("");
  const [eventWeightKind, setEventWeightKind] = useState("");
  const [eventPhotos, setEventPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [recordingEvent, setRecordingEvent] = useState(false);

  const resetForm = () => {
    setEventNotes(""); setEventWeight(""); setEventWeightKind(""); setEventPhotos([]);
  };

  // رفع صورة الإثبات بنفس تدفّق التخزين القائم (request-url → PUT → objectPath).
  async function uploadEventPhoto(file: File) {
    setUploadingPhoto(true);
    try {
      const { uploadURL, objectPath } = await apiFetch<{ uploadURL: string; objectPath: string }>(
        "/storage/uploads/request-url",
        { method: "POST", body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }) },
      );
      const put = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("فشل رفع الصورة إلى التخزين");
      setEventPhotos((p) => [...p, objectPath]);
      toast({ title: "تم رفع الصورة" });
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر رفع الصورة", description: getErrorMessage(e) });
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function recordEvent() {
    if (!activeEvent) return;
    if (TRIP_EVENT_CLOSING.has(activeEvent) && eventPhotos.length === 0) {
      toast({ variant: "destructive", title: "صورة الإثبات مطلوبة", description: "واقعة الإغلاق (تفريغ/تسليم) تتطلب صورة POD." });
      return;
    }
    setRecordingEvent(true);
    // التقاط موقع GPS (أفضل-جهد — اختياري؛ يُتجاهل عند الرفض/التعذّر).
    let coords: { lat: number; lng: number } | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 60000 }));
      coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch { /* الموقع اختياري */ }
    try {
      await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({
          eventType: activeEvent,
          ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
          ...(eventWeight ? { weightKg: Number(eventWeight) } : {}),
          ...(eventWeight && eventWeightKind ? { weightKind: eventWeightKind } : {}),
          ...(eventPhotos.length ? { proofObjectPaths: eventPhotos } : {}),
          ...(eventNotes.trim() ? { notes: eventNotes.trim() } : {}),
        }),
      });
      toast({ title: "تم تسجيل الواقعة" });
      setActiveEvent(null);
      resetForm();
      onRecorded?.();
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر تسجيل الواقعة", description: getErrorMessage(e) });
    } finally {
      setRecordingEvent(false);
    }
  }

  if (!executable) {
    return (
      <div className="text-xs text-muted-foreground">
        {disabledHint ?? "تسجيل الوقائع غير متاح في هذه الحالة."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {TRIP_EVENT_DEFS.map((e) => (
          <Button
            key={e.type}
            size="sm"
            variant={activeEvent === e.type ? "default" : "outline"}
            onClick={() => { setActiveEvent(activeEvent === e.type ? null : e.type); resetForm(); }}
          >
            {e.label}
          </Button>
        ))}
      </div>

      {activeEvent && (
        <div className="border rounded-md p-3 space-y-2 bg-muted/30">
          <div className="text-sm font-medium">
            تسجيل واقعة: {TRIP_EVENT_LABEL[activeEvent] ?? activeEvent}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground w-24">الوزن (كغم)</label>
            <Input
              type="number" min="0" value={eventWeight}
              onChange={(e) => setEventWeight(e.target.value)}
              className="w-32 h-8" placeholder="اختياري"
            />
            {eventWeight && (
              <div className="flex flex-wrap gap-1">
                {(["tare", "gross", "axle", "other"] as const).map((k) => (
                  <Button
                    key={k}
                    type="button"
                    size="sm"
                    variant={eventWeightKind === k ? "default" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setEventWeightKind(eventWeightKind === k ? "" : k)}
                  >
                    {TRIP_WEIGHT_KIND_LABEL[k]}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground w-24">الإثبات</label>
            <input
              type="file" accept="image/*" capture="environment"
              disabled={uploadingPhoto}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadEventPhoto(f); e.currentTarget.value = ""; }}
              className="text-xs"
            />
            <span className="text-xs text-muted-foreground">
              {uploadingPhoto ? "جاري الرفع…" : `${eventPhotos.length} صورة`}
              {TRIP_EVENT_CLOSING.has(activeEvent) && eventPhotos.length === 0 ? " — مطلوبة للإغلاق" : ""}
            </span>
          </div>
          <Input
            value={eventNotes} onChange={(e) => setEventNotes(e.target.value)}
            placeholder="ملاحظة (اختياري)" className="h-8 text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={recordEvent} disabled={recordingEvent || uploadingPhoto}>
              {recordingEvent ? "جاري التسجيل…" : "تسجيل الواقعة"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setActiveEvent(null); resetForm(); }}>
              إلغاء
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
