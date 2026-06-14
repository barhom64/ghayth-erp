import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UmrahGroupPicker } from "@/components/shared/umrah-group-picker";
import { Plus, AlertCircle, CheckCircle2 } from "lucide-react";
import { ROUTE_TYPES } from "@/lib/transport-constants";

// #1812 operational review — closes the user's gap #2:
//   "تكامل العمرة ناقص. من الصورة لا يوجد سؤال:
//      هل النقل من مجموعة عمرة؟
//      هل من برنامج عمرة؟
//      هل من رحلة جوية؟
//      هل من فندق؟
//    وهذا كان من أهم متطلبات #1812."
//
// This component activates ONLY when transportServiceType is
// passenger_umrah, and walks the operator through the four umrah-
// specific discovery questions in order. Each "yes" branch exposes
// the matching picker / input + auto-binds the data into the booking
// form via the standard onSet* callbacks.

interface Props {
  /** Show only when the service type is passenger_umrah. */
  active: boolean;
  // Current values (controlled).
  umrahGroupId: string;
  flightNumber: string;
  hotelName: string;
  supervisorName: string;
  supervisorPhone: string;
  routeType: string;
  // Setters.
  setUmrahGroupId: (v: string) => void;
  setPassengerCount: (v: string) => void;
  setCustomerName: (v: string) => void;
  setFlightNumber: (v: string) => void;
  setHotelName: (v: string) => void;
  setSupervisorName: (v: string) => void;
  setSupervisorPhone: (v: string) => void;
  setRouteType: (v: string) => void;
  setBookingSource: (v: string) => void;
}

// ROUTE_TYPES مُوحَّد في "@/lib/transport-constants" (UX-05 — كان مكرّرًا حرفيًا).

export function UmrahContextQuestionnaire(props: Props) {
  if (!props.active) return null;

  const hasGroup = !!props.umrahGroupId;
  const hasFlight = !!props.flightNumber.trim();
  const hasHotel = !!props.hotelName.trim();
  const hasSupervisor = !!props.supervisorName.trim();

  return (
    <Card className="border-2 border-status-warning-foreground/40 bg-status-warning-surface/15">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Badge variant="outline" className="bg-status-warning-surface">٢</Badge>
          سياق العمرة — أجِب عن الأسئلة الأربعة
        </CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          عمليات النقل في موسم العمرة تربط حجزاً واحداً بمجموعة معتمرين،
          رحلة جوية، فندق، ومشرف. كلّ سؤال تجيب عنه يربط الحجز بمصدره
          ويُغني عن إعادة الإدخال في الأنظمة الأخرى.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* السؤال 1 — مجموعة عمرة */}
        <div className="border-b pb-2">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="flex-1">
              <div className="text-sm font-medium flex items-center gap-2">
                {hasGroup
                  ? <CheckCircle2 className="h-4 w-4 text-status-success-foreground" />
                  : <AlertCircle className="h-4 w-4 text-status-warning-foreground" />}
                ١. هل النقل من مجموعة عمرة موجودة في النظام؟
              </div>
              <div className="text-xs text-muted-foreground pr-6">
                إن نعم — اختر المجموعة لتعبئة عدد الركاب والعميل والمشرف تلقائياً.
              </div>
            </div>
            <UmrahGroupPicker
              trigger={
                <button
                  type="button"
                  className="text-xs text-status-info-foreground hover:underline px-2 py-1 border border-status-info-foreground rounded"
                >
                  <Plus className="h-3 w-3 inline ml-1" />
                  {hasGroup ? "تبديل المجموعة" : "اختر مجموعة"}
                </button>
              }
              onSelect={(g) => {
                props.setUmrahGroupId(String(g.id));
                props.setPassengerCount(String(g.mutamerCount));
                if (g.name) props.setCustomerName(g.name);
                props.setBookingSource("umrah_group");
              }}
            />
          </div>
          {hasGroup && (
            <div className="text-xs text-status-success-foreground pr-6">
              ✓ تم الربط بالمجموعة #{props.umrahGroupId}
            </div>
          )}
        </div>

        {/* السؤال 2 — رحلة جوية */}
        <div className="border-b pb-2">
          <div className="text-sm font-medium flex items-center gap-2 mb-1">
            {hasFlight
              ? <CheckCircle2 className="h-4 w-4 text-status-success-foreground" />
              : <AlertCircle className="h-4 w-4 text-status-warning-foreground" />}
            ٢. هل النقل مرتبط برحلة جوية؟
          </div>
          <div className="text-xs text-muted-foreground pr-6 mb-2">
            إن نعم — أدخل رقم الرحلة (مثل: SV1234) لاستخدامه في تأكيد الحجز.
          </div>
          <div className="pr-6">
            <Label htmlFor="umrah-flight" className="text-xs">رقم الرحلة الجوية</Label>
            <Input
              id="umrah-flight"
              dir="ltr"
              value={props.flightNumber}
              onChange={(e) => props.setFlightNumber(e.target.value)}
              placeholder="SV1234 / EK803 / ..."
              className="font-mono"
            />
          </div>
        </div>

        {/* السؤال 3 — فندق */}
        <div className="border-b pb-2">
          <div className="text-sm font-medium flex items-center gap-2 mb-1">
            {hasHotel
              ? <CheckCircle2 className="h-4 w-4 text-status-success-foreground" />
              : <AlertCircle className="h-4 w-4 text-status-warning-foreground" />}
            ٣. هل وجهة النقل فندق محدد؟
          </div>
          <div className="text-xs text-muted-foreground pr-6 mb-2">
            إن نعم — اسم الفندق يظهر في تأكيد الحجز ويُربط بعنوان السكن.
          </div>
          <div className="pr-6">
            <Label htmlFor="umrah-hotel" className="text-xs">اسم الفندق</Label>
            <Input
              id="umrah-hotel"
              value={props.hotelName}
              onChange={(e) => props.setHotelName(e.target.value)}
              placeholder="مثال: فندق مكة هيلتون / فندق المدينة موڤنبيك"
            />
          </div>
        </div>

        {/* السؤال 4 — مشرف */}
        <div className="border-b pb-2">
          <div className="text-sm font-medium flex items-center gap-2 mb-1">
            {hasSupervisor
              ? <CheckCircle2 className="h-4 w-4 text-status-success-foreground" />
              : <AlertCircle className="h-4 w-4 text-status-warning-foreground" />}
            ٤. هل يوجد مشرف للمجموعة على متن الرحلة؟
          </div>
          <div className="text-xs text-muted-foreground pr-6 mb-2">
            المشرف هو نقطة الاتصال الميدانية للسائق وقت الاستلام والتسليم.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-6">
            <div>
              <Label htmlFor="umrah-supervisor-name" className="text-xs">اسم المشرف</Label>
              <Input
                id="umrah-supervisor-name"
                value={props.supervisorName}
                onChange={(e) => props.setSupervisorName(e.target.value)}
                placeholder="مثال: أحمد عبدالله"
              />
            </div>
            <div>
              <Label htmlFor="umrah-supervisor-phone" className="text-xs">جوال المشرف</Label>
              <Input
                id="umrah-supervisor-phone"
                dir="ltr"
                inputMode="tel"
                value={props.supervisorPhone}
                onChange={(e) => props.setSupervisorPhone(e.target.value)}
                placeholder="+9665XXXXXXXX"
                className="font-mono"
              />
            </div>
          </div>
        </div>

        {/* نوع المسار العمري */}
        <div>
          <div className="text-sm font-medium mb-1">
            نوع المسار العمري
          </div>
          <div className="text-xs text-muted-foreground mb-2">
            صنف المسار العام للرحلة. إن كانت رحلة متعددة المقاطع، استخدم محرر
            المقاطع أدناه لتحديد نوع كل مقطع منفصلاً.
          </div>
          <Select
            value={props.routeType || "_none"}
            onValueChange={(v) => props.setRouteType(v === "_none" ? "" : v)}
          >
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">—</SelectItem>
              {ROUTE_TYPES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary indicator */}
        <div className="mt-3 pt-2 border-t bg-white -m-3 p-3">
          <div className="text-xs text-muted-foreground">
            ✓ اكتمل: {[hasGroup, hasFlight, hasHotel, hasSupervisor].filter(Boolean).length} / 4
            {hasGroup && hasFlight && hasHotel && hasSupervisor && (
              <span className="text-status-success-foreground font-medium mr-2">
                — جميع المعلومات السياقية مكتملة
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
