import { useMemo, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Gauge, Camera, Check, Send } from "lucide-react";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

// حالات الفحص اليومي بالعربية — لا قيم إنجليزية خام تظهر للسائق.
const INSPECTION_STATUS_LABELS: Record<string, string> = {
  pending: "قيد المراجعة",
  submitted: "تم الإرسال",
  approved: "معتمد",
  rejected: "مرفوض",
};

// متابعة النقل بالصور (PR3) — شاشة السائق لوفاء الفحص اليومي: يُدخل قراءة العداد،
// يلتقط صور العداد والاتجاهات (الكاميرا)، ثم يُرسل. كل صورة تُرفع إلى GCS عبر
// تدفّق /storage/uploads/request-url ثم تُسجَّل على فحصه (/fleet/me/inspections/:id/photos).

interface MeInspection {
  id: number; vehicleId: number; plateNumber: string | null;
  inspectionType: string; odometer: number | null; status: string;
  dueDate: string | null; photoCount: number;
}

// أنواع الصور المطلوبة للفحص اليومي (العداد إلزامي، البقية لتوثيق الحالة).
const PHOTO_TILES: { type: string; label: string }[] = [
  { type: "odometer", label: "قراءة العداد" },
  { type: "front", label: "أمامية" },
  { type: "rear", label: "خلفية" },
  { type: "left", label: "جانب أيسر" },
  { type: "right", label: "جانب أيمن" },
  { type: "fuel_gauge", label: "مؤشر الوقود" },
];

export default function MeInspection() {
  const [, params] = useRoute("/fleet/me/inspections/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const inspectionId = Number(params?.id ?? 0);

  const listQ = useApiQuery<{ data: MeInspection[] }>(["fleet-me-inspections"], "/fleet/me/inspections");
  const inspection = (listQ.data?.data ?? []).find((i) => i.id === inspectionId);

  const [odometer, setOdometer] = useState("");
  const [notes, setNotes] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const locked = inspection?.status === "approved" || inspection?.status === "rejected";

  // صفوف الطباعة = قائمة تحقّق صور الفحص (كل نوع صورة + حالته + العدد المُلتقط).
  const photoRows = useMemo(
    () =>
      PHOTO_TILES.map((tile) => {
        const count = counts[tile.type] ?? 0;
        return {
          "الصورة": tile.label,
          "إلزامية": tile.type === "odometer" ? "نعم" : "لا",
          "الحالة": count > 0 ? "مُلتقطة" : "غير مُلتقطة",
          "العدد": count,
        };
      }),
    [counts],
  );
  const { sortedRows: printRows } = usePrintRows<any>(photoRows);

  async function uploadPhoto(photoType: string, file: File) {
    setUploading(photoType);
    try {
      const { uploadURL, objectPath } = await apiFetch<{ uploadURL: string; objectPath: string }>(
        "/storage/uploads/request-url",
        { method: "POST", body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }) },
      );
      const put = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("فشل رفع الصورة إلى التخزين");
      await apiFetch(`/fleet/me/inspections/${inspectionId}/photos`, {
        method: "POST",
        body: JSON.stringify({ photoType, storageKey: objectPath, fileName: file.name, mimeType: file.type, fileSize: file.size }),
      });
      setCounts((c) => ({ ...c, [photoType]: (c[photoType] ?? 0) + 1 }));
      qc.invalidateQueries({ queryKey: ["fleet-me-inspections"] });
      toast({ title: "تم رفع الصورة" });
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر رفع الصورة", description: getErrorMessage(e) });
    } finally {
      setUploading(null);
    }
  }

  async function submit() {
    if (!odometer) {
      toast({ variant: "destructive", title: "قراءة العداد مطلوبة" });
      return;
    }
    if (!(counts.odometer > 0)) {
      toast({ variant: "destructive", title: "صورة العداد مطلوبة", description: "التقط صورة لقراءة العداد قبل الإرسال." });
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/fleet/me/inspections/${inspectionId}/submit`, {
        method: "POST",
        body: JSON.stringify({ odometer: Number(odometer), notes: notes.trim() || undefined }),
      });
      qc.invalidateQueries({ queryKey: ["fleet-me-inspections"] });
      toast({ title: "تم إرسال الفحص اليومي" });
      navigate("/fleet/me");
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر الإرسال", description: getErrorMessage(e) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell
      title="الفحص اليومي للمركبة"
      breadcrumbs={[{ href: "/fleet/me", label: "بوابتي" }, { label: "الفحص اليومي" }]}
      actions={
        <PrintButton
          entityType="report_fleet_me_inspection"
          entityId={String(inspectionId)}
          size="icon"
          payload={() => ({
            entity: {
              title: `الفحص اليومي — المركبة ${inspection?.plateNumber ?? inspection?.vehicleId ?? ""}`,
              total: printRows.length,
              status: INSPECTION_STATUS_LABELS[inspection?.status ?? ""] ?? inspection?.status,
              odometer: inspection?.odometer,
              dueDate: inspection?.dueDate,
            },
            items: printRows,
          })}
        />
      }
    >
      {!inspection ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          {listQ.isLoading ? "جارٍ التحميل…" : "الطلب غير موجود أو لا يخصّك."}
        </CardContent></Card>
      ) : (
        <div className="space-y-4 max-w-xl">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span>المركبة {inspection.plateNumber ?? inspection.vehicleId}</span>
                <Badge variant="outline">{inspection.dueDate ?? ""}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {locked && (
                <p className="text-sm text-status-warning">هذا الفحص {inspection.status === "approved" ? "معتمد" : "مرفوض"} — لا يمكن تعديله.</p>
              )}
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Gauge className="h-4 w-4" /> قراءة العداد (كم)</Label>
                <Input
                  type="number" inputMode="numeric" value={odometer} disabled={locked}
                  onChange={(e) => setOdometer(e.target.value)} placeholder="مثال: 105230"
                />
              </div>

              <div>
                <Label className="mb-2 block">صور الفحص</Label>
                <div className="grid grid-cols-2 gap-2">
                  {PHOTO_TILES.map((tile) => {
                    const done = (counts[tile.type] ?? 0) > 0;
                    return (
                      <label
                        key={tile.type}
                        className={`flex items-center justify-between gap-2 rounded-md border p-3 text-sm cursor-pointer ${done ? "border-status-success bg-status-success/5" : "border-input"} ${locked ? "opacity-50 pointer-events-none" : ""}`}
                      >
                        <span className="flex items-center gap-2">
                          {done ? <Check className="h-4 w-4 text-status-success" /> : <Camera className="h-4 w-4 text-muted-foreground" />}
                          {tile.label}
                          {tile.type === "odometer" && <span className="text-status-error">*</span>}
                          {done && (counts[tile.type] ?? 0) > 1 && <Badge variant="secondary">{counts[tile.type]}</Badge>}
                        </span>
                        <input
                          type="file" accept="image/*" capture="environment" className="hidden"
                          disabled={locked || uploading === tile.type}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(tile.type, f); e.target.value = ""; }}
                        />
                        {uploading === tile.type && <span className="text-xs text-muted-foreground">جارٍ…</span>}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>ملاحظات (اختياري)</Label>
                <Input value={notes} disabled={locked} onChange={(e) => setNotes(e.target.value)} placeholder="أي ملاحظة على حالة المركبة" />
              </div>

              <Button className="w-full" onClick={submit} disabled={locked || submitting}>
                <Send className="h-4 w-4 me-1" />
                {submitting ? "جارٍ الإرسال…" : "إرسال الفحص"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
