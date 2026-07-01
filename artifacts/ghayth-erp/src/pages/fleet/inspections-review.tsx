import { useState } from "react";
import { useApiQuery, useApiMutation, apiFetch, apiUrl } from "@/lib/api";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageStatusBadge, resolveStatus } from "@workspace/ui-core";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PreviewButton } from "@/components/shared/attachment-preview";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck, Image as ImageIcon } from "lucide-react";

// متابعة النقل بالصور (PR3) — شاشة مراجعة المشرف: قائمة الفحوص المُرسَلة، عرض
// صورها، واعتماد/رفض كل فحص. القراءة عبر /fleet/inspections (RBAC fleet.vehicles).

const TYPE_AR: Record<string, string> = {
  handover: "استلام", return: "تسليم", daily: "يومي", adhoc: "طارئ",
};
const PHOTO_AR: Record<string, string> = {
  odometer: "العداد", front: "أمامية", rear: "خلفية", left: "أيسر", right: "أيمن",
  interior: "داخلية", fuel_gauge: "الوقود", damage: "ضرر", other: "أخرى",
};

interface InspectionRow {
  id: number; vehicleId: number; plateNumber: string | null; inspectionType: string;
  odometer: number | null; status: string; capturedAt: string | null; photoCount: number;
}
interface InspectionPhoto {
  id: number; photoType: string; storageKey: string; fileName: string | null; mimeType: string | null; fileSize: number | null;
}

export default function InspectionsReview() {
  const { toast } = useToast();
  const [status, setStatus] = useState<"submitted" | "approved" | "rejected" | "all">("submitted");
  const [selected, setSelected] = useState<InspectionRow | null>(null);
  const [photos, setPhotos] = useState<InspectionPhoto[]>([]);
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState("");

  const listQ = useApiQuery<{ data: InspectionRow[] }>(
    ["fleet-inspections", status],
    `/fleet/inspections${status === "all" ? "" : `?status=${status}`}`,
  );
  const rows = listQ.data?.data ?? [];

  const approveMut = useApiMutation<unknown, { id: number }>(
    (b) => `/fleet/inspections/${b.id}/approve`, "POST", [["fleet-inspections"]],
    { successMessage: "تم اعتماد الفحص", onSuccess: () => closeDialog() },
  );
  const rejectMut = useApiMutation<unknown, { id: number; reason: string }>(
    (b) => `/fleet/inspections/${b.id}/reject`, "POST", [["fleet-inspections"]],
    { successMessage: "تم رفض الفحص", onSuccess: () => closeDialog() },
  );

  function closeDialog() {
    setSelected(null); setPhotos([]); setRejectMode(false); setReason("");
  }

  async function openReview(row: InspectionRow) {
    setSelected(row); setPhotos([]); setRejectMode(false); setReason("");
    try {
      const resp = await apiFetch<{ photos: InspectionPhoto[] }>(`/fleet/inspections/${row.id}`);
      setPhotos(resp.photos ?? []);
    } catch {
      toast({ variant: "destructive", title: "تعذّر تحميل الصور" });
    }
  }

  const columns: DataTableColumn<InspectionRow>[] = [
    { key: "plateNumber", header: "المركبة", searchable: true, render: (r) => r.plateNumber ?? `#${r.vehicleId}` },
    { key: "inspectionType", header: "النوع", render: (r) => TYPE_AR[r.inspectionType] ?? r.inspectionType },
    { key: "odometer", header: "العداد", render: (r) => (r.odometer != null ? r.odometer.toLocaleString("ar") : "—") },
    { key: "photoCount", header: "الصور", render: (r) => <span className="flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" />{r.photoCount}</span> },
    { key: "status", header: "الحالة", render: (r) => <PageStatusBadge status={r.status} domain="inspection" /> },
    { key: "capturedAt", header: "وقت الالتقاط", render: (r) => (r.capturedAt ? new Date(r.capturedAt).toLocaleString("ar") : "—") },
    { key: "actions", header: "إجراء", render: (r) => <Button size="sm" variant="outline" onClick={() => openReview(r)}>مراجعة</Button> },
  ];

  if (listQ.isLoading) return <LoadingSpinner />;
  if (listQ.isError) return <ErrorState />;

  return (
    <PageShell title="مراجعة فحوص المركبات" breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "مراجعة الفحوص" }]}>
      <FleetTabsNav />
      <div className="mb-3 flex gap-2">
        {(["submitted", "approved", "rejected", "all"] as const).map((s) => (
          <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
            {s === "all" ? "الكل" : resolveStatus(s, "inspection")?.label ?? s}
          </Button>
        ))}
      </div>

      <DataTable columns={columns} data={rows} searchPlaceholder="بحث برقم اللوحة…" />

      <Dialog open={!!selected} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              فحص المركبة {selected?.plateNumber ?? selected?.vehicleId}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-3">
                <span>النوع: <b>{TYPE_AR[selected.inspectionType] ?? selected.inspectionType}</b></span>
                <span>العداد: <b>{selected.odometer != null ? selected.odometer.toLocaleString("ar") : "—"}</b></span>
                <span>الحالة: <PageStatusBadge status={selected.status} domain="inspection" /></span>
              </div>

              <div>
                <Label className="mb-1 block">الصور ({photos.length})</Label>
                {photos.length === 0 ? (
                  <p className="text-muted-foreground">لا صور.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {photos.map((p) => (
                      <PreviewButton
                        key={p.id}
                        size="sm" variant="outline"
                        label={PHOTO_AR[p.photoType] ?? p.photoType}
                        attachment={{
                          id: p.id, fileName: p.fileName ?? `${p.photoType}.jpg`,
                          mimeType: p.mimeType ?? "image/jpeg", fileSize: p.fileSize ?? undefined,
                          previewUrl: apiUrl(`/storage/objects/${p.storageKey}`),
                          downloadUrl: apiUrl(`/storage/objects/${p.storageKey}`),
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {rejectMode && (
                <div className="space-y-1">
                  <Label>سبب الرفض</Label>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="اكتب سبب الرفض" />
                </div>
              )}
            </div>
          )}

          {selected && (selected.status === "submitted" || selected.status === "pending") && (
            <DialogFooter className="gap-2">
              {!rejectMode ? (
                <>
                  <GuardedButton perm="fleet.vehicles:approve" variant="destructive" onClick={() => setRejectMode(true)}>رفض</GuardedButton>
                  <GuardedButton perm="fleet.vehicles:approve" onClick={() => approveMut.mutate({ id: selected.id })} disabled={approveMut.isPending}>اعتماد</GuardedButton>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setRejectMode(false)}>إلغاء</Button>
                  <GuardedButton
                    perm="fleet.vehicles:approve" variant="destructive"
                    onClick={() => { if (!reason.trim()) { toast({ variant: "destructive", title: "سبب الرفض مطلوب" }); return; } rejectMut.mutate({ id: selected.id, reason: reason.trim() }); }}
                    disabled={rejectMut.isPending}
                  >تأكيد الرفض</GuardedButton>
                </>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
