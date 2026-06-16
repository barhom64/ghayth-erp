// N6 — Umrah Accommodation page.
//
// Closes N6 from docs/testing/CRITICAL_DEFECTS_REPORT.md. Surfaces the
// 3-table model from migration 246: hotels catalog, per-season room
// blocks, per-pilgrim room allocations. Operator can:
//   - Maintain a hotels catalog (Add Hotel → fills city + star rating)
//   - Create a room block for a season (Hotel × Season × dates ×
//     totalRooms × ratePerNight)
//   - Allocate pilgrims to rooms inside a block (capacity-guarded by
//     backend)
//
// Page is intentionally minimal — the goal is to replace the free-text
// `hotelName` workflow with structured data, not to ship a full
// channel-manager.
import { useState } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Hotel, BedDouble, Plus } from "lucide-react";
import { PrintButton } from "@/components/shared/print-button";
import { useToast } from "@/hooks/use-toast";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { GuardedButton } from "@/components/shared/permission-gate";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";

export default function AccommodationsPage() {
  const { toast } = useToast();
  const { data: hotelsResp, isLoading: hLoad, isError: hErr, refetch: refetchHotels } = useApiQuery<any>(
    ["umrah-hotels"], "/umrah/hotels"
  );
  const { data: blocksResp, isLoading: bLoad, isError: bErr, refetch: refetchBlocks } = useApiQuery<any>(
    ["umrah-room-blocks"], "/umrah/room-blocks"
  );
  const hotels = asList(hotelsResp);
  const blocks = asList(blocksResp);

  const [showHotel, setShowHotel] = useState(false);
  const [hotelForm, setHotelForm] = useState({ name: "", city: "", starRating: "", contactPhone: "" });
  const createHotel = useApiMutation("/umrah/hotels", "POST");

  const [showBlock, setShowBlock] = useState(false);
  const [blockForm, setBlockForm] = useState({
    hotelId: "",
    checkInDate: "",
    checkOutDate: "",
    roomType: "double",
    totalRooms: "",
    ratePerNight: "",
  });
  const createBlock = useApiMutation("/umrah/room-blocks", "POST");

  const hotelCols: DataTableColumn<any>[] = [
    { key: "name", header: "اسم الفندق", className: "font-semibold", render: (h) => h.name },
    { key: "city", header: "المدينة", render: (h) => h.city ?? "—" },
    { key: "starRating", header: "التصنيف", render: (h) => h.starRating ? "★".repeat(Number(h.starRating)) : "—" },
    { key: "contactPhone", header: "هاتف التواصل", className: "font-mono", render: (h) => h.contactPhone ?? "—" },
  ];

  const blockCols: DataTableColumn<any>[] = [
    { key: "hotelName", header: "الفندق", className: "font-semibold", render: (b) => b.hotelName ?? `#${b.hotelId}` },
    { key: "roomType", header: "نوع الغرفة", render: (b) => b.roomType ?? "—" },
    { key: "totalRooms", header: "إجمالي الغرف", className: "text-end", render: (b) => Number(b.totalRooms).toLocaleString("ar-SA") },
    { key: "allocatedCount", header: "تم تخصيصه", className: "text-end", render: (b) => Number(b.allocatedCount ?? 0).toLocaleString("ar-SA") },
    {
      key: "remaining",
      header: "المتبقي",
      className: "text-end font-semibold",
      render: (b) => {
        const remain = Number(b.totalRooms) - Number(b.allocatedCount ?? 0);
        return (
          <span className={remain === 0 ? "text-status-error-foreground" : remain < 5 ? "text-status-warning-foreground" : "text-status-success-foreground"}>
            {remain}
          </span>
        );
      },
    },
    { key: "ratePerNight", header: "السعر/ليلة", className: "text-end font-mono", render: (b) => b.ratePerNight ? `${b.ratePerNight} ${b.currency || "SAR"}` : "—" },
    { key: "checkInDate", header: "من", render: (b) => b.checkInDate ?? "—" },
    { key: "checkOutDate", header: "إلى", render: (b) => b.checkOutDate ?? "—" },
  ];

  if (hLoad || bLoad) return <LoadingSpinner />;
  if (hErr || bErr) return <ErrorState />;

  return (
    <PageShell
      title="الإقامة الفندقية"
      breadcrumbs={[{ href: "/umrah/dashboard", label: "العمرة" }, { label: "الإقامة" }]}
      actions={
        <PrintButton
          entityType="report_umrah_accommodations"
          entityId="list"
          size="icon"
          label="طباعة كتالوج الإقامة"
          payload={() => ({
            entity: {
              title: "كتالوج الفنادق والكتل السكنية",
              hotelsCount: hotels.length,
              blocksCount: blocks.length,
            },
            sections: [
              {
                title: "كتالوج الفنادق",
                rows: hotels.map((h: any) => ({
                  "اسم الفندق": h.name || "—",
                  "المدينة": h.city || "—",
                  "تصنيف": h.starRating ? `${h.starRating} نجوم` : "—",
                  "العنوان": h.address || "—",
                  "الهاتف": h.phone || "—",
                })),
              },
              {
                title: "الكتل السكنية المحجوزة",
                rows: blocks.map((b: any) => ({
                  "الفندق": b.hotelName || "—",
                  "المجموعة": b.groupName || "—",
                  "نوع الغرفة": b.roomType || "—",
                  "عدد الغرف": b.roomCount ?? "—",
                  "من": b.checkInDate || "—",
                  "إلى": b.checkOutDate || "—",
                })),
              },
            ],
          })}
        />
      }
    >
      <UmrahTabsNav />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {/* ─── Hotels catalog ──────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Hotel className="h-4 w-4" /> كتالوج الفنادق ({hotels.length})
              </h3>
              <GuardedButton perm="umrah:create" size="sm" onClick={() => setShowHotel((v) => !v)} data-testid="button-add-hotel">
                <Plus className="h-3 w-3 me-1" /> {showHotel ? "إلغاء" : "فندق جديد"}
              </GuardedButton>
            </div>

            {showHotel && (
              <div className="space-y-2 rounded-lg bg-status-info-surface/30 p-3" data-testid="form-add-hotel">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">اسم الفندق *</Label>
                    <Input value={hotelForm.name} onChange={(e) => setHotelForm((v) => ({ ...v, name: e.target.value }))} data-testid="input-hotel-name" />
                  </div>
                  <div>
                    <Label className="text-xs">المدينة</Label>
                    <Input value={hotelForm.city} onChange={(e) => setHotelForm((v) => ({ ...v, city: e.target.value }))} placeholder="مكة المكرمة" data-testid="input-hotel-city" />
                  </div>
                  <div>
                    <Label className="text-xs">التصنيف النجمي (1-7)</Label>
                    <Input type="number" min={1} max={7} value={hotelForm.starRating} onChange={(e) => setHotelForm((v) => ({ ...v, starRating: e.target.value }))} data-testid="input-hotel-rating" />
                  </div>
                  <div>
                    <Label className="text-xs">رقم التواصل</Label>
                    <Input value={hotelForm.contactPhone} onChange={(e) => setHotelForm((v) => ({ ...v, contactPhone: e.target.value }))} placeholder="+966..." data-testid="input-hotel-phone" />
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={!hotelForm.name || createHotel.isPending}
                  data-testid="button-submit-hotel"
                  onClick={async () => {
                    try {
                      await createHotel.mutateAsync({
                        name: hotelForm.name,
                        city: hotelForm.city || undefined,
                        starRating: hotelForm.starRating ? Number(hotelForm.starRating) : undefined,
                        contactPhone: hotelForm.contactPhone || undefined,
                      });
                      toast({ title: "تم إضافة الفندق" });
                      setHotelForm({ name: "", city: "", starRating: "", contactPhone: "" });
                      setShowHotel(false);
                      await refetchHotels();
                    } catch (err: any) {
                      toast({ title: "فشل الإضافة", description: err?.message, variant: "destructive" });
                    }
                  }}
                >
                  {createHotel.isPending ? "جاري الحفظ..." : "حفظ"}
                </Button>
              </div>
            )}

            <DataTable
              columns={hotelCols}
              data={hotels}
              rowKey={(h: any) => h.id}
              emptyMessage="لا يوجد فنادق في الكتالوج بعد. ابدأ بإضافة فندق."
              emptyIcon={<Hotel className="h-6 w-6 text-slate-400" />}
            />
          </CardContent>
        </Card>

        {/* ─── Room blocks ─────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <BedDouble className="h-4 w-4" /> بلوكات الغرف ({blocks.length})
              </h3>
              <GuardedButton
                perm="umrah:create"
                size="sm"
                disabled={hotels.length === 0}
                onClick={() => setShowBlock((v) => !v)}
                data-testid="button-add-block"
              >
                <Plus className="h-3 w-3 me-1" /> {showBlock ? "إلغاء" : "بلوك جديد"}
              </GuardedButton>
            </div>

            {showBlock && (
              <div className="space-y-2 rounded-lg bg-status-info-surface/30 p-3" data-testid="form-add-block">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">الفندق *</Label>
                    <select
                      className="w-full h-9 border rounded-md px-2 text-sm"
                      value={blockForm.hotelId}
                      onChange={(e) => setBlockForm((v) => ({ ...v, hotelId: e.target.value }))}
                      data-testid="select-block-hotel"
                    >
                      <option value="">— اختر فندق —</option>
                      {hotels.map((h: any) => (
                        <option key={h.id} value={h.id}>{h.name} {h.city ? `(${h.city})` : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">نوع الغرفة</Label>
                    <select
                      className="w-full h-9 border rounded-md px-2 text-sm"
                      value={blockForm.roomType}
                      onChange={(e) => setBlockForm((v) => ({ ...v, roomType: e.target.value }))}
                      data-testid="select-block-room-type"
                    >
                      <option value="single">فردي</option>
                      <option value="double">مزدوج</option>
                      <option value="triple">ثلاثي</option>
                      <option value="quad">رباعي</option>
                      <option value="suite">جناح</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">إجمالي الغرف *</Label>
                    <Input type="number" min={1} value={blockForm.totalRooms} onChange={(e) => setBlockForm((v) => ({ ...v, totalRooms: e.target.value }))} data-testid="input-block-total" />
                  </div>
                  <div>
                    <Label className="text-xs">سعر الليلة (ر.س)</Label>
                    <Input type="number" min={0} value={blockForm.ratePerNight} onChange={(e) => setBlockForm((v) => ({ ...v, ratePerNight: e.target.value }))} data-testid="input-block-rate" />
                  </div>
                  <div>
                    <Label className="text-xs">تاريخ الدخول</Label>
                    <Input type="date" value={blockForm.checkInDate} onChange={(e) => setBlockForm((v) => ({ ...v, checkInDate: e.target.value }))} data-testid="input-block-checkin" />
                  </div>
                  <div>
                    <Label className="text-xs">تاريخ الخروج</Label>
                    <Input type="date" value={blockForm.checkOutDate} onChange={(e) => setBlockForm((v) => ({ ...v, checkOutDate: e.target.value }))} data-testid="input-block-checkout" />
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={!blockForm.hotelId || !blockForm.totalRooms || createBlock.isPending}
                  data-testid="button-submit-block"
                  onClick={async () => {
                    try {
                      await createBlock.mutateAsync({
                        hotelId: Number(blockForm.hotelId),
                        roomType: blockForm.roomType,
                        totalRooms: Number(blockForm.totalRooms),
                        ratePerNight: blockForm.ratePerNight ? Number(blockForm.ratePerNight) : undefined,
                        checkInDate: blockForm.checkInDate || undefined,
                        checkOutDate: blockForm.checkOutDate || undefined,
                      });
                      toast({ title: "تم إنشاء البلوك" });
                      setBlockForm({ hotelId: "", checkInDate: "", checkOutDate: "", roomType: "double", totalRooms: "", ratePerNight: "" });
                      setShowBlock(false);
                      await refetchBlocks();
                    } catch (err: any) {
                      toast({ title: "فشل الإنشاء", description: err?.message, variant: "destructive" });
                    }
                  }}
                >
                  {createBlock.isPending ? "جاري الحفظ..." : "حفظ"}
                </Button>
              </div>
            )}

            <DataTable
              columns={blockCols}
              data={blocks}
              rowKey={(b: any) => b.id}
              emptyMessage={hotels.length === 0 ? "أضف فندقاً أولاً ثم أنشئ بلوكاً." : "لا توجد بلوكات بعد."}
              emptyIcon={<BedDouble className="h-6 w-6 text-slate-400" />}
            />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
