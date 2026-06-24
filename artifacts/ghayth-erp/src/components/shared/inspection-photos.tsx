import { useState } from "react";
import { useApiQuery, apiFetch, apiUrl, getErrorMessage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PreviewButton } from "@/components/shared/attachment-preview";
import { useToast } from "@/hooks/use-toast";
import { Camera, Image as ImageIcon } from "lucide-react";

// متابعة النقل بالصور (PR3) — مكوّن مُعاد الاستخدام: صور فحص الاستلام/التسليم
// لعقد إيجار. يربط الصور بسجل فحص (inspectionType=handover|return,
// rentalContractId) عبر نقاط /fleet/inspections (RBAC fleet.vehicles). الرفع
// يمرّ بتدفّق /storage الموجود ثم يُسجَّل على الفحص.

const PHASES: { type: "handover" | "return"; label: string }[] = [
  { type: "handover", label: "صور الاستلام" },
  { type: "return", label: "صور التسليم" },
];
const PHOTO_TILES: { type: string; label: string }[] = [
  { type: "odometer", label: "العداد" },
  { type: "front", label: "أمامية" },
  { type: "rear", label: "خلفية" },
  { type: "left", label: "أيسر" },
  { type: "right", label: "أيمن" },
  { type: "damage", label: "ضرر" },
];
const PHOTO_AR: Record<string, string> = {
  odometer: "العداد", front: "أمامية", rear: "خلفية", left: "أيسر", right: "أيمن",
  interior: "داخلية", fuel_gauge: "الوقود", damage: "ضرر", other: "أخرى",
};

interface InspRow { id: number; inspectionType: string; status: string; photoCount: number; }
interface InspPhoto { id: number; photoType: string; storageKey: string; fileName: string | null; mimeType: string | null; }

export function RentalInspectionPhotos({ vehicleId, rentalContractId }: { vehicleId: number; rentalContractId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = ["fleet-rental-inspections", String(rentalContractId)];
  const listQ = useApiQuery<{ data: InspRow[] }>(key, `/fleet/inspections?rentalContractId=${rentalContractId}`);
  const inspections = listQ.data?.data ?? [];

  const [uploading, setUploading] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<number, InspPhoto[]>>({});

  async function ensureInspection(phase: "handover" | "return"): Promise<number> {
    const existing = inspections.find((i) => i.inspectionType === phase);
    if (existing) return existing.id;
    const created = await apiFetch<{ id: number }>("/fleet/inspections", {
      method: "POST",
      body: JSON.stringify({ vehicleId, rentalContractId, inspectionType: phase }),
    });
    await qc.invalidateQueries({ queryKey: key });
    return created.id;
  }

  async function capture(phase: "handover" | "return", photoType: string, file: File) {
    setUploading(`${phase}:${photoType}`);
    try {
      const inspectionId = await ensureInspection(phase);
      const { uploadURL, objectPath } = await apiFetch<{ uploadURL: string; objectPath: string }>(
        "/storage/uploads/request-url",
        { method: "POST", body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }) },
      );
      const put = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("فشل رفع الصورة");
      await apiFetch(`/fleet/inspections/${inspectionId}/photos`, {
        method: "POST",
        body: JSON.stringify({ photoType, storageKey: objectPath, fileName: file.name, mimeType: file.type, fileSize: file.size }),
      });
      await qc.invalidateQueries({ queryKey: key });
      setPhotos((p) => { const n = { ...p }; delete n[inspectionId]; return n; }); // force re-fetch on view
      toast({ title: "تم رفع الصورة" });
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر رفع الصورة", description: getErrorMessage(e) });
    } finally { setUploading(null); }
  }

  async function loadPhotos(inspectionId: number) {
    try {
      const resp = await apiFetch<{ photos: InspPhoto[] }>(`/fleet/inspections/${inspectionId}`);
      setPhotos((p) => ({ ...p, [inspectionId]: resp.photos ?? [] }));
    } catch { toast({ variant: "destructive", title: "تعذّر تحميل الصور" }); }
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Camera className="h-4 w-4" /> صور الفحص</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {PHASES.map((phase) => {
          const insp = inspections.find((i) => i.inspectionType === phase.type);
          const locked = insp?.status === "approved" || insp?.status === "rejected";
          return (
            <div key={phase.type} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  {phase.label}
                  {insp && <Badge variant="secondary"><ImageIcon className="h-3 w-3 me-1" />{insp.photoCount}</Badge>}
                </span>
                {insp && insp.photoCount > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => loadPhotos(insp.id)}>عرض الصور</Button>
                )}
              </div>
              {!locked && (
                <div className="grid grid-cols-3 gap-2">
                  {PHOTO_TILES.map((tile) => (
                    <label key={tile.type} className="flex items-center justify-center gap-1 rounded-md border border-input p-2 text-xs cursor-pointer hover:bg-muted/40">
                      <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                      {tile.label}
                      <input
                        type="file" accept="image/*" capture="environment" className="hidden"
                        disabled={uploading === `${phase.type}:${tile.type}`}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) capture(phase.type, tile.type, f); e.target.value = ""; }}
                      />
                    </label>
                  ))}
                </div>
              )}
              {insp && photos[insp.id] && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {photos[insp.id].length === 0 ? <span className="text-xs text-muted-foreground">لا صور.</span> :
                    photos[insp.id].map((ph) => (
                      <PreviewButton
                        key={ph.id} size="sm" variant="outline" label={PHOTO_AR[ph.photoType] ?? ph.photoType}
                        attachment={{
                          id: ph.id, fileName: ph.fileName ?? `${ph.photoType}.jpg`, mimeType: ph.mimeType ?? "image/jpeg",
                          previewUrl: apiUrl(`/storage/objects/${ph.storageKey}`), downloadUrl: apiUrl(`/storage/objects/${ph.storageKey}`),
                        }}
                      />
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
