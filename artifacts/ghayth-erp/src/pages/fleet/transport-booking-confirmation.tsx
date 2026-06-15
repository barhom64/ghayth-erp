import { useEffect } from "react";
import { useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PrintButton } from "@/components/shared/print-button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

// #1812 — booking confirmation document (user's gap #10):
//   "أي نظام نقل محترم يحتاج تأكيد حجز يشمل: العميل / المسار / الفندق
//    / المجموعة / المركبة / السائق / QR."
//
// This page is a SCREEN-ONLY preview that lets the operator review the
// confirmation before printing. Actual print/PDF generation goes through
// the canonical Ghaith Print Platform via <PrintButton entityType=
// "transport_booking_confirmation" entityId={id} /> — the Print Engine
// produces the PDF with branch letterhead, audit log entry, watermarks,
// etc. (per docs/architecture/print-platform.md).

interface ConfirmationData {
  id: number;
  bookingNumber: string;
  bookingSource: string;
  transportServiceType: string;
  customerName: string | null;
  linkedCustomerName: string | null;
  customerPhone: string | null;
  fromLocationText: string | null;
  toLocationText: string | null;
  routeType: string | null;
  requestedPickupDate: string | null;
  requestedPickupTime: string | null;
  requestedDeliveryDate: string | null;
  requestedDeliveryTime: string | null;
  hotelName: string | null;
  flightNumber: string | null;
  supervisorName: string | null;
  supervisorPhone: string | null;
  umrahGroupId: number | null;
  passengerCount: number | null;
  notes: string | null;
  createdAt: string;
  qrDataUrl: string | null;
  qrPayload: string;
  lines: Array<{
    id: number;
    lineNumber: number;
    fromLocationText: string | null;
    toLocationText: string | null;
    fromLocationKind: string | null;
    toLocationKind: string | null;
    scheduledPickupAt: string | null;
    scheduledDeliveryAt: string | null;
    passengerCount: number | null;
    lineDescription: string | null;
  }>;
  dispatchOrders: Array<{
    id: number;
    vehiclePlate: string | null;
    driverName: string | null;
    driverPhone: string | null;
    scheduledStartAt: string;
    scheduledEndAt: string;
    status: string;
  }>;
}

const SERVICE_TYPE_LABEL: Record<string, string> = {
  cargo_load: "نقل حمولة",
  passenger_umrah: "نقل معتمرين",
  passenger_general: "نقل ركاب",
  equipment_rental: "تأجير معدة",
  internal_transfer: "نقل داخلي",
  other: "أخرى",
};

const KIND_LABEL: Record<string, string> = {
  airport: "مطار", gate: "بوابة", hotel: "فندق", mazar: "مزار",
  warehouse: "مستودع", project: "مشروع", customer_site: "موقع عميل",
  depot: "مستودع تشغيلي", mosque: "مسجد", other: "أخرى",
};

const fmtDate = (d: string | null): string => d ? new Date(d).toLocaleDateString("ar") : "—";
const fmtTime = (t: string | null): string => t ? t.slice(0, 5) : "—";
const fmtDateTime = (s: string | null): string => s ? new Date(s).toLocaleString("ar") : "—";

export default function TransportBookingConfirmation() {
  const [, params] = useRoute("/fleet/transport/bookings/:id/confirmation");
  const id = params?.id;
  const { data, isLoading, isError } = useApiQuery<{ data: ConfirmationData }>(
    ["transport-booking-confirmation", id || ""],
    id ? `/transport/bookings/${id}/confirmation` : null,
    !!id,
  );

  useEffect(() => {
    document.title = data?.data?.bookingNumber
      ? `تأكيد حجز ${data.data.bookingNumber} — غيث`
      : "تأكيد حجز — غيث";
  }, [data?.data?.bookingNumber]);

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data) return <ErrorState />;
  const c = data.data;
  const isUmrah = c.transportServiceType === "passenger_umrah";

  return (
    <div dir="rtl" className="bg-surface-subtle min-h-screen">
      <div className="bg-white border-b p-3 flex items-center justify-between max-w-[800px] mx-auto">
        <Button asChild variant="ghost" size="sm"><Link href={`/fleet/transport/bookings/${id}`}>
            <ArrowLeft className="h-4 w-4 ml-1" />
            عودة للحجز
          </Link></Button>
        {/* Canonical Ghaith Print Platform — produces PDF with branch
            letterhead, audit log entry, watermark, RBAC checks. The
            entityType key resolves to loadTransportBookingConfirmation
            on the server (dataLoader.ts) + the matching print preset. */}
        <PrintButton
          entityType="transport_booking_confirmation"
          entityId={id ?? ""}
          label="طباعة / حفظ PDF"
          formats={["a4"]}
        />
      </div>

      <Card className="max-w-[800px] mx-auto mt-4 bg-white">
        <CardContent className="p-6" style={{ fontFamily: "system-ui, sans-serif" }}>
          <div className="flex items-start justify-between border-b-2 border-status-info-foreground pb-4 mb-4">
            <div>
              <div className="text-2xl font-bold">تأكيد حجز نقل</div>
              <div className="text-sm text-muted-foreground">معاينة على الشاشة — استخدم زر الطباعة لإنتاج PDF عبر منصة الطباعة</div>
              <div className="text-lg font-mono mt-2">{c.bookingNumber}</div>
            </div>
            {c.qrDataUrl && (
              <div className="text-center">
                <img src={c.qrDataUrl} alt="QR" style={{ width: 120, height: 120 }} />
                <div className="text-xs text-muted-foreground mt-1">امسح للتحقق</div>
              </div>
            )}
          </div>

          <table className="w-full text-sm mb-4" style={{ borderCollapse: "collapse" }}>
            <tbody>
              <tr><td className="py-1 pl-3 text-muted-foreground w-32">العميل</td><td className="font-medium">{c.linkedCustomerName || c.customerName || "—"}</td></tr>
              <tr><td className="py-1 pl-3 text-muted-foreground">رقم الهاتف</td><td className="font-mono" dir="ltr">{c.customerPhone || "—"}</td></tr>
              <tr><td className="py-1 pl-3 text-muted-foreground">نوع الخدمة</td><td>{SERVICE_TYPE_LABEL[c.transportServiceType] || c.transportServiceType}</td></tr>
              {c.umrahGroupId && <tr><td className="py-1 pl-3 text-muted-foreground">مجموعة عمرة</td><td className="font-mono">#{c.umrahGroupId}</td></tr>}
              <tr><td className="py-1 pl-3 text-muted-foreground">عدد الركاب</td><td>{c.passengerCount ?? "—"}</td></tr>
              <tr><td className="py-1 pl-3 text-muted-foreground">تاريخ التحميل</td><td>{fmtDate(c.requestedPickupDate)} {fmtTime(c.requestedPickupTime)}</td></tr>
              <tr><td className="py-1 pl-3 text-muted-foreground">تاريخ التسليم</td><td>{fmtDate(c.requestedDeliveryDate)} {fmtTime(c.requestedDeliveryTime)}</td></tr>
            </tbody>
          </table>

          {isUmrah && (
            <div className="border-t pt-3 mb-4">
              <div className="text-sm font-semibold mb-2">بيانات العمرة</div>
              <table className="w-full text-sm">
                <tbody>
                  <tr><td className="py-1 pl-3 text-muted-foreground w-32">رقم الرحلة</td><td className="font-mono" dir="ltr">{c.flightNumber || "—"}</td></tr>
                  <tr><td className="py-1 pl-3 text-muted-foreground">الفندق</td><td>{c.hotelName || "—"}</td></tr>
                  <tr><td className="py-1 pl-3 text-muted-foreground">المشرف</td><td>{c.supervisorName || "—"} {c.supervisorPhone && <span className="font-mono" dir="ltr">({c.supervisorPhone})</span>}</td></tr>
                </tbody>
              </table>
            </div>
          )}

          {c.lines.length > 0 && (
            <div className="border-t pt-3 mb-4">
              <div className="text-sm font-semibold mb-2">مقاطع المسار ({c.lines.length})</div>
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr className="bg-surface-subtle">
                    <th className="text-right p-1 border">#</th>
                    <th className="text-right p-1 border">من</th>
                    <th className="text-right p-1 border">إلى</th>
                    <th className="text-right p-1 border">الانطلاق</th>
                    <th className="text-right p-1 border">الوصول</th>
                  </tr>
                </thead>
                <tbody>
                  {c.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="p-1 border font-mono">{l.lineNumber}</td>
                      <td className="p-1 border">
                        {l.fromLocationText || "—"}
                        {l.fromLocationKind && <span className="text-xs text-muted-foreground mr-1">({KIND_LABEL[l.fromLocationKind] || l.fromLocationKind})</span>}
                      </td>
                      <td className="p-1 border">
                        {l.toLocationText || "—"}
                        {l.toLocationKind && <span className="text-xs text-muted-foreground mr-1">({KIND_LABEL[l.toLocationKind] || l.toLocationKind})</span>}
                      </td>
                      <td className="p-1 border text-xs">{fmtDateTime(l.scheduledPickupAt)}</td>
                      <td className="p-1 border text-xs">{fmtDateTime(l.scheduledDeliveryAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {c.lines.length === 0 && (c.fromLocationText || c.toLocationText) && (
            <div className="border-t pt-3 mb-4">
              <div className="text-sm font-semibold mb-2">المسار</div>
              <table className="w-full text-sm">
                <tbody>
                  <tr><td className="py-1 pl-3 text-muted-foreground w-32">من</td><td>{c.fromLocationText || "—"}</td></tr>
                  <tr><td className="py-1 pl-3 text-muted-foreground">إلى</td><td>{c.toLocationText || "—"}</td></tr>
                </tbody>
              </table>
            </div>
          )}

          {c.dispatchOrders.length > 0 && (
            <div className="border-t pt-3 mb-4">
              <div className="text-sm font-semibold mb-2">المركبات والسائقون المُسنَدون</div>
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr className="bg-surface-subtle">
                    <th className="text-right p-1 border">المركبة</th>
                    <th className="text-right p-1 border">السائق</th>
                    <th className="text-right p-1 border">هاتف السائق</th>
                    <th className="text-right p-1 border">البداية</th>
                  </tr>
                </thead>
                <tbody>
                  {c.dispatchOrders.map((d) => (
                    <tr key={d.id}>
                      <td className="p-1 border font-mono">{d.vehiclePlate || "—"}</td>
                      <td className="p-1 border">{d.driverName || "—"}</td>
                      <td className="p-1 border font-mono" dir="ltr">{d.driverPhone || "—"}</td>
                      <td className="p-1 border text-xs">{fmtDateTime(d.scheduledStartAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {c.notes && (
            <div className="border-t pt-3 mb-4">
              <div className="text-sm font-semibold mb-1">ملاحظات</div>
              <div className="text-sm whitespace-pre-wrap">{c.notes}</div>
            </div>
          )}

          <div className="border-t pt-3 mt-6 text-xs text-muted-foreground text-center">
            صدر هذا التأكيد عبر نظام غيث بتاريخ {new Date().toLocaleString("ar")}.
            <br />
            {c.qrPayload && <span className="font-mono">رمز التحقق: {c.qrPayload}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
