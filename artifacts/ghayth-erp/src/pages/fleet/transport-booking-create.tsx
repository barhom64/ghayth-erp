import { useState } from "react";
import { useLocation, Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { ROUTE_TYPES } from "@/lib/transport-constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateField } from "@/components/shared/form-field-wrapper";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageShell } from "@workspace/ui-core";
import { ArrowLeft, Plus, Users, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { UmrahGroupPicker } from "@/components/shared/umrah-group-picker";
import { BookingSourceSelector, type BookingSourcePrefill } from "@/components/shared/booking-source-selector";
import { LocationKindPicker } from "@/components/shared/location-kind-picker";
import { MultiLegBookingEditor, type BookingLeg, legsToApiPayload } from "@/components/shared/multi-leg-booking-editor";
import { UmrahContextQuestionnaire } from "@/components/shared/umrah-context-questionnaire";
import { VehicleSelect, DriverSelect } from "@/components/shared/entity-selects";

// #1733 Comment 9 — booking create form. The operator-side intake
// surface for the pre-trip pipeline. Field visibility is driven by the
// selected `transportServiceType` so cargo-specific fields don't clutter
// an umrah-passenger booking and vice versa.

const SERVICE_TYPES = [
  { value: "cargo_load", label: "نقل حمولة" },
  { value: "passenger_umrah", label: "نقل معتمرين" },
  { value: "passenger_general", label: "نقل ركاب" },
  { value: "equipment_rental", label: "تأجير معدة" },
  { value: "internal_transfer", label: "نقل داخلي" },
  { value: "other", label: "أخرى" },
] as const;

const BOOKING_SOURCES = [
  { value: "manual_entry", label: "إدخال يدوي" },
  { value: "customer_request", label: "طلب عميل" },
  { value: "umrah_group", label: "مجموعة عمرة" },
  { value: "contract_schedule", label: "جدول عقد" },
  { value: "import_excel", label: "استيراد Excel" },
  { value: "api_integration", label: "تكامل API" },
  { value: "recurring_schedule", label: "جدول متكرر" },
] as const;

// ROUTE_TYPES مُوحَّد في "@/lib/transport-constants" (UX-05 — كان مكرّرًا حرفيًا).

export default function TransportBookingCreate() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  // Shared fields.
  // #TA-T18-UX-AUDIT-01 UX-04 — رقم الحجز يُولَّد تلقائيًا (قابل للتعديل) بدل
  // إلزام المستخدم بإدخال مفتاح تقني في أول حقل.
  const [bookingNumber, setBookingNumber] = useState(
    () => `B-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
  );
  const [bookingSource, setBookingSource] = useState<string>("manual_entry");
  const [transportServiceType, setTransportServiceType] = useState<string>("cargo_load");
  const [customerName, setCustomerName] = useState("");
  // #1812 source-driven booking (gap #1) — customer/contract/project IDs
  // come from the source selector; the form proceeds to text-only edit
  // after the source is locked.
  const [customerId, setCustomerId] = useState<string>("");
  const [contractId, setContractId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [recurringTemplateId, setRecurringTemplateId] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [fromLocationText, setFromLocationText] = useState("");
  const [toLocationText, setToLocationText] = useState("");
  // #1812 location-kind + inline geo on booking header (from #1888).
  const [fromLocationKind, setFromLocationKind] = useState<string | undefined>();
  const [toLocationKind, setToLocationKind] = useState<string | undefined>();
  const [fromLat, setFromLat] = useState("");
  const [fromLng, setFromLng] = useState("");
  const [toLat, setToLat] = useState("");
  const [toLng, setToLng] = useState("");
  const [showGeoFields, setShowGeoFields] = useState(false);
  // #TA-T18-UX-AUDIT-01 UX-04 — الحد الأدنى أولًا: تُطوى كتلة «اتفاق العميل +
  // النوافذ الزمنية» المتقدمة افتراضيًا، وتظهر عند الطلب فقط.
  const [showAgreement, setShowAgreement] = useState(false);
  // #1812 multi-leg booking — user's #1 explicit gap.
  const [legs, setLegs] = useState<BookingLeg[]>([]);
  const [requestedPickupDate, setRequestedPickupDate] = useState("");
  const [requestedPickupTime, setRequestedPickupTime] = useState("");
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState("");
  const [requestedDeliveryTime, setRequestedDeliveryTime] = useState("");
  const [notes, setNotes] = useState("");

  // Cargo-specific.
  const [cargoDescription, setCargoDescription] = useState("");
  const [cargoWeight, setCargoWeight] = useState<string>("");

  // Passenger / umrah.
  const [passengerCount, setPassengerCount] = useState<string>("");
  const [umrahGroupId, setUmrahGroupId] = useState<string>("");
  const [flightNumber, setFlightNumber] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [supervisorPhone, setSupervisorPhone] = useState("");
  const [hotelName, setHotelName] = useState("");
  const [routeType, setRouteType] = useState<string>("");

  // #1812 customer-agreement fields (Comment 3 — اتفاق العميل).
  const [requestedVehicleClass, setRequestedVehicleClass] = useState("");
  const [vehicleSubstitutionPolicy, setVehicleSubstitutionPolicy] = useState<string>("equivalent_allowed");
  const [allowUpgrade, setAllowUpgrade] = useState(false);
  const [requiredExactVehicleId, setRequiredExactVehicleId] = useState("");
  const [requiredExactDriverId, setRequiredExactDriverId] = useState("");

  // #1812 time-window fields.
  const [pickupWindowStart, setPickupWindowStart] = useState("");
  const [pickupWindowEnd, setPickupWindowEnd] = useState("");
  const [dropoffWindowStart, setDropoffWindowStart] = useState("");
  const [dropoffWindowEnd, setDropoffWindowEnd] = useState("");
  const [fixedAppointmentTime, setFixedAppointmentTime] = useState("");
  const [isFlexibleTime, setIsFlexibleTime] = useState(false);
  const [priority, setPriority] = useState<string>("0");

  // #1812 source-driven booking — applyPrefill is defined AFTER all
  // useState hooks so JS hoisting doesn't break the setter references.
  const applyPrefill = (p: BookingSourcePrefill) => {
    setBookingSource(p.bookingSource);
    if (p.customerId) setCustomerId(String(p.customerId));
    if (p.customerName) setCustomerName(p.customerName);
    if (p.customerPhone) setCustomerPhone(p.customerPhone);
    if (p.contractId) setContractId(String(p.contractId));
    if (p.projectId) setProjectId(String(p.projectId));
    if (p.umrahGroupId) setUmrahGroupId(String(p.umrahGroupId));
    if (p.passengerCount != null) setPassengerCount(String(p.passengerCount));
    if (p.recurringTemplateId) setRecurringTemplateId(String(p.recurringTemplateId));
  };

  const isCargo = transportServiceType === "cargo_load";
  const isUmrah = transportServiceType === "passenger_umrah";
  const isPassenger = transportServiceType.startsWith("passenger_");

  // #1812 Wave 0.2 — linked-source guard. Any one of these IDs being
  // set means the booking is anchored to a structured upstream entity
  // (CRM / umrah / contract / project). Free-text customerName alone
  // is no longer accepted by the backend (see transport-bookings.ts
  // createBookingSchema refinement).
  const hasLinkedSource = Boolean(
    customerId || umrahGroupId || contractId || projectId,
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingNumber.trim()) {
      toast({ variant: "destructive", title: "رقم الحجز مطلوب" });
      return;
    }
    if (!hasLinkedSource) {
      toast({
        variant: "destructive",
        title: "اختر مصدر الحجز أولاً",
        description: "يجب ربط الحجز بعميل من CRM أو مجموعة عمرة أو عقد أو مشروع. اسم العميل النصّي وحده غير مقبول.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        bookingNumber: bookingNumber.trim(),
        bookingSource,
        transportServiceType,
        // #1812 source-driven booking — IDs come from the BookingSourceSelector.
        customerId: customerId ? Number(customerId) : undefined,
        contractId: contractId ? Number(contractId) : undefined,
        projectId: projectId ? Number(projectId) : undefined,
        recurringTemplateId: recurringTemplateId ? Number(recurringTemplateId) : undefined,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        fromLocationText: fromLocationText.trim() || undefined,
        toLocationText: toLocationText.trim() || undefined,
        fromLocationKind: fromLocationKind || undefined,
        toLocationKind: toLocationKind || undefined,
        fromLat: fromLat ? Number(fromLat) : undefined,
        fromLng: fromLng ? Number(fromLng) : undefined,
        toLat: toLat ? Number(toLat) : undefined,
        toLng: toLng ? Number(toLng) : undefined,
        lines: legs.length > 0 ? legsToApiPayload(legs) : undefined,
        requestedPickupDate: requestedPickupDate || undefined,
        requestedPickupTime: requestedPickupTime || undefined,
        requestedDeliveryDate: requestedDeliveryDate || undefined,
        requestedDeliveryTime: requestedDeliveryTime || undefined,
        // #1812 customer-agreement fields (Comment 3).
        requestedVehicleClass: requestedVehicleClass.trim() || undefined,
        vehicleSubstitutionPolicy,
        allowUpgrade,
        requiredExactVehicleId: requiredExactVehicleId ? Number(requiredExactVehicleId) : undefined,
        requiredExactDriverId:  requiredExactDriverId  ? Number(requiredExactDriverId)  : undefined,
        // #1812 time-window fields.
        pickupWindowStart: pickupWindowStart || undefined,
        pickupWindowEnd:   pickupWindowEnd   || undefined,
        dropoffWindowStart: dropoffWindowStart || undefined,
        dropoffWindowEnd:   dropoffWindowEnd   || undefined,
        fixedAppointmentTime: fixedAppointmentTime || undefined,
        isFlexibleTime,
        priority: Number(priority || "0"),
        notes: notes.trim() || undefined,
      };
      if (isCargo) {
        body.cargoDescription = cargoDescription.trim() || undefined;
        if (cargoWeight) body.cargoWeight = Number(cargoWeight);
      }
      if (isPassenger) {
        if (passengerCount) body.passengerCount = Number(passengerCount);
      }
      if (isUmrah) {
        if (umrahGroupId) body.umrahGroupId = Number(umrahGroupId);
        body.flightNumber = flightNumber.trim() || undefined;
        body.supervisorName = supervisorName.trim() || undefined;
        body.supervisorPhone = supervisorPhone.trim() || undefined;
        body.hotelName = hotelName.trim() || undefined;
        body.routeType = routeType || undefined;
      }

      const res = await apiFetch<{ data: { id: number } }>("/transport/bookings", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast({ title: "تم إنشاء الحجز" });
      const newId = res?.data?.id;
      if (newId) navigate(`/fleet/transport/bookings/${newId}`);
      else navigate("/fleet/transport/bookings");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر إنشاء الحجز", description: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell
      title="حجز نقل جديد"
      subtitle="استقبال طلب نقل وإنشاء حجز قبل توزيعه على سائق"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/transport/bookings", label: "حجوزات النقل" },
        { label: "حجز جديد" },
      ]}
      actions={
        <Link href="/fleet/transport/bookings">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 me-1" />العودة للقائمة
          </Button>
        </Link>
      }
    >
      <FleetTabsNav />

      <form onSubmit={submit} className="space-y-4 max-w-4xl">
        {/* #1812 source-driven booking (user's gap #1). The selector
            comes FIRST so the operator picks an upstream source
            (umrah_group / customer / contract / project) before
            typing any free-form fields. Source picks auto-fill
            customer name, phone, passenger count, etc. */}
        <BookingSourceSelector
          currentSource={bookingSource}
          onPrefill={applyPrefill}
        />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">البيانات الأساسية</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="bookingNumber">رقم الحجز *</Label>
              <Input
                id="bookingNumber"
                value={bookingNumber}
                onChange={(e) => setBookingNumber(e.target.value)}
                placeholder="مثال: BK-2026-001"
                required
              />
            </div>
            <div>
              <Label htmlFor="transportServiceType">نوع الخدمة *</Label>
              <Select value={transportServiceType} onValueChange={setTransportServiceType}>
                <SelectTrigger id="transportServiceType"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="bookingSource">مصدر الحجز</Label>
              <Select value={bookingSource} onValueChange={setBookingSource}>
                <SelectTrigger id="bookingSource"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BOOKING_SOURCES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* #1812 Wave 0.2 — customer name/phone are READ-ONLY here.
                They come from the BookingSourceSelector above so a
                downstream invoice always points to a real CRM /
                umrah / contract / project record. */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="customerName">اسم العميل (من المصدر)</Label>
                <Input
                  id="customerName"
                  value={customerName}
                  readOnly
                  className="bg-surface-subtle"
                  placeholder={hasLinkedSource ? customerName : "اختر مصدر الحجز أعلاه"}
                />
              </div>
              <div>
                <Label htmlFor="customerPhone">جوال العميل (من المصدر)</Label>
                <Input
                  id="customerPhone"
                  value={customerPhone}
                  readOnly
                  className="bg-surface-subtle"
                  placeholder={hasLinkedSource ? customerPhone : "—"}
                />
              </div>
            </div>
            {!hasLinkedSource && (
              <div className="md:col-span-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-2">
                لا يمكن إنشاء الحجز بدون مصدر منظَّم (عميل CRM / مجموعة عمرة / عقد / مشروع). اختر مصدراً من القسم أعلاه.
              </div>
            )}
          </CardContent>
        </Card>

        {/* #1812 umrah context (user's gap #2). Activates ONLY when the
            service type is passenger_umrah. Walks the operator through
            the 4 discovery questions (group / flight / hotel / supervisor)
            and links each "yes" answer to the matching picker/field. */}
        <UmrahContextQuestionnaire
          active={isUmrah}
          umrahGroupId={umrahGroupId}
          flightNumber={flightNumber}
          hotelName={hotelName}
          supervisorName={supervisorName}
          supervisorPhone={supervisorPhone}
          routeType={routeType}
          setUmrahGroupId={setUmrahGroupId}
          setPassengerCount={setPassengerCount}
          setCustomerName={setCustomerName}
          setFlightNumber={setFlightNumber}
          setHotelName={setHotelName}
          setSupervisorName={setSupervisorName}
          setSupervisorPhone={setSupervisorPhone}
          setRouteType={setRouteType}
          setBookingSource={setBookingSource}
        />

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">المسار والتوقيت</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="from">من</Label>
              <Input id="from" value={fromLocationText} onChange={(e) => setFromLocationText(e.target.value)} placeholder="موقع التحميل" />
              <LocationKindPicker
                id="fromKind"
                value={fromLocationKind}
                onChange={setFromLocationKind}
                placeholder="نوع موقع التحميل"
              />
              {showGeoFields && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number" step="0.0000001" value={fromLat}
                    onChange={(e) => setFromLat(e.target.value)}
                    placeholder="خط العرض"
                  />
                  <Input
                    type="number" step="0.0000001" value={fromLng}
                    onChange={(e) => setFromLng(e.target.value)}
                    placeholder="خط الطول"
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">إلى</Label>
              <Input id="to" value={toLocationText} onChange={(e) => setToLocationText(e.target.value)} placeholder="موقع التسليم" />
              <LocationKindPicker
                id="toKind"
                value={toLocationKind}
                onChange={setToLocationKind}
                placeholder="نوع موقع التسليم"
              />
              {showGeoFields && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number" step="0.0000001" value={toLat}
                    onChange={(e) => setToLat(e.target.value)}
                    placeholder="خط العرض"
                  />
                  <Input
                    type="number" step="0.0000001" value={toLng}
                    onChange={(e) => setToLng(e.target.value)}
                    placeholder="خط الطول"
                  />
                </div>
              )}
            </div>
            <div className="md:col-span-2">
              <button
                type="button"
                className="text-xs text-status-info-foreground hover:underline"
                onClick={() => setShowGeoFields((s) => !s)}
              >
                {showGeoFields ? "إخفاء إحداثيات GPS" : "أضف إحداثيات GPS (اختياري)"}
              </button>
            </div>
            {/* #1812 unified-dates (user's gap #8) — DateField wraps the
                canonical UnifiedDateInput so date display matches the
                rest of Ghaith (Hijri toggle, Asia/Riyadh anchor,
                shared parser). Replaces the native <input type=date>
                that broke the dashboard / calendar / report formatters. */}
            <DateField
              label="تاريخ التحميل" id="pickupDate" mode="date"
              value={requestedPickupDate}
              onChange={setRequestedPickupDate}
            />
            <div>
              <Label htmlFor="pickupTime">وقت التحميل</Label>
              <Input id="pickupTime" type="time" value={requestedPickupTime} onChange={(e) => setRequestedPickupTime(e.target.value)} />
            </div>
            <DateField
              label="تاريخ التسليم" id="deliveryDate" mode="date"
              value={requestedDeliveryDate}
              onChange={setRequestedDeliveryDate}
            />
            <div>
              <Label htmlFor="deliveryTime">وقت التسليم</Label>
              <Input id="deliveryTime" type="time" value={requestedDeliveryTime} onChange={(e) => setRequestedDeliveryTime(e.target.value)} />
            </div>
            {/* #TA-T18-UX-AUDIT-01 P2-1 — نموذج توقيت موحّد: هذه الأوقات هي مرجع
                الجدولة؛ تُشتقّ منها نافذة المحرك تلقائيًا. النوافذ المتقدمة اختيارية. */}
            <div className="sm:col-span-2">
              <p className="text-[11px] text-muted-foreground">
                تُستخدم أوقات التحميل/التسليم أعلاه للجدولة والتوزيع تلقائيًا — لا حاجة لتعبئة النوافذ الزمنية في «تفاصيل إضافية» إلا عند الحاجة.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* #1812 multi-leg booking — user's #1 explicit gap. Each leg
            maps to a transport_booking_lines row; the editor submits
            the whole array atomically. */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              مقاطع المسار (Multi-leg)
            </CardTitle>
            <p className="text-xs text-muted-foreground pt-1">
              للرحلات متعددة المقاطع (مثل: مطار → فندق → الحرم → المدينة → فندق → مطار).
              المقاطع اختيارية — اتركها فارغة للرحلة البسيطة.
            </p>
          </CardHeader>
          <CardContent>
            <MultiLegBookingEditor legs={legs} onChange={setLegs} />
          </CardContent>
        </Card>

        {/* #1733 Comment 9 — service-type-driven dynamic field visibility */}
        {isCargo && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4" />تفاصيل الحمولة
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="cargoDescription">وصف الحمولة</Label>
                <Input id="cargoDescription" value={cargoDescription} onChange={(e) => setCargoDescription(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="cargoWeight">الوزن (كجم)</Label>
                <Input id="cargoWeight" type="number" min={0} value={cargoWeight} onChange={(e) => setCargoWeight(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        )}

        {isPassenger && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />تفاصيل الركاب
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="passengerCount">عدد الركاب</Label>
                <Input id="passengerCount" type="number" min={0} value={passengerCount} onChange={(e) => setPassengerCount(e.target.value)} />
              </div>
              {isUmrah && (
                <>
                  <div className="md:col-span-2">
                    <Label htmlFor="umrahGroupId">مجموعة العمرة (من النظام)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="umrahGroupId"
                        type="number"
                        min={0}
                        value={umrahGroupId}
                        onChange={(e) => setUmrahGroupId(e.target.value)}
                        placeholder="اختر من القائمة لتعبئة البيانات تلقائياً"
                        className="flex-1"
                      />
                      <UmrahGroupPicker
                        onSelect={(g) => {
                          setUmrahGroupId(String(g.id));
                          // Auto-fill passenger count from the group's
                          // mutamerCount — operator can still edit.
                          if (g.mutamerCount > 0) {
                            setPassengerCount(String(g.mutamerCount));
                          }
                          // Auto-fill customer name with group name as a
                          // sensible default (the operator can override).
                          if (!customerName && g.name) {
                            setCustomerName(g.name);
                          }
                          // Flip booking source so audit trail shows the
                          // link, not "manual_entry".
                          setBookingSource("umrah_group");
                          toast({
                            title: `تم ربط المجموعة ${g.nuskGroupNumber}`,
                            description: `${g.mutamerCount} معتمر — تم تعبئة عدد الركاب تلقائياً.`,
                          });
                        }}
                      />
                    </div>
                    {umrahGroupId && (
                      <div className="text-xs text-status-info-foreground mt-1">
                        مرتبط بمجموعة العمرة #{umrahGroupId} — أي تعديل على عدد الركاب موثّق في سجل التدقيق.
                      </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="flightNumber">رقم الرحلة</Label>
                    <Input id="flightNumber" value={flightNumber} onChange={(e) => setFlightNumber(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="routeType">نوع المسار</Label>
                    <Select value={routeType} onValueChange={setRouteType}>
                      <SelectTrigger id="routeType"><SelectValue placeholder="اختر نوع المسار" /></SelectTrigger>
                      <SelectContent>
                        {ROUTE_TYPES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="supervisorName">اسم المشرف</Label>
                    <Input id="supervisorName" value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="supervisorPhone">جوال المشرف</Label>
                    <Input id="supervisorPhone" value={supervisorPhone} onChange={(e) => setSupervisorPhone(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="hotelName">الفندق</Label>
                    <Input id="hotelName" value={hotelName} onChange={(e) => setHotelName(e.target.value)} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* #1812 — اتفاق العميل + النوافذ الزمنية (Comment 3) */}
        {/* #TA-T18-UX-AUDIT-01 UX-04 — كتلة متقدمة مطويّة افتراضيًا (الحد الأدنى أولًا). */}
        <Card>
          <CardHeader className="pb-2">
            <button
              type="button"
              onClick={() => setShowAgreement((s) => !s)}
              className="flex items-center justify-between w-full text-start"
            >
              <CardTitle className="text-sm">تفاصيل إضافية (اتفاق العميل + النوافذ الزمنية)</CardTitle>
              <span className="text-xs text-muted-foreground">{showAgreement ? "إخفاء ▲" : "إظهار ▼"}</span>
            </button>
          </CardHeader>
          {showAgreement && (
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>فئة المركبة المطلوبة</Label>
              <Input
                value={requestedVehicleClass}
                onChange={(e) => setRequestedVehicleClass(e.target.value)}
                placeholder="مثلاً sedan / suv / bus_45 / truck"
              />
            </div>
            <div>
              <Label>سياسة استبدال المركبة</Label>
              <Select value={vehicleSubstitutionPolicy} onValueChange={setVehicleSubstitutionPolicy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="exact_only">نفس المركبة فقط</SelectItem>
                  <SelectItem value="same_class_only">نفس الفئة فقط</SelectItem>
                  <SelectItem value="equivalent_allowed">فئة مكافئة مسموحة</SelectItem>
                  <SelectItem value="upgrade_allowed">ترقية مسموحة</SelectItem>
                  <SelectItem value="operator_approval">بموافقة المشغل</SelectItem>
                  <SelectItem value="customer_approval">بموافقة العميل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              {/* #TA-T18-UX-AUDIT-01 UX-03 — منتقي مركبة حقيقي بدل إدخال رقم
                  قاعدة البيانات الخام. المحرك يفرض requiredExactVehicleId كحارس
                  صلب عند الاقتراح والإسناد. */}
              <VehicleSelect
                label="المركبة المطلوبة (اختياري)"
                value={requiredExactVehicleId}
                onChange={(v) => setRequiredExactVehicleId(String(v ?? ""))}
                allowCreate={false}
              />
              <p className="text-[11px] text-muted-foreground mt-1">إذا اشترط العميل مركبة بعينها</p>
            </div>
            <div>
              <DriverSelect
                label="السائق المطلوب (اختياري)"
                value={requiredExactDriverId}
                onChange={(v) => setRequiredExactDriverId(String(v ?? ""))}
                allowCreate={false}
              />
              <p className="text-[11px] text-muted-foreground mt-1">إذا اشترط العميل سائقاً بعينه</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox" id="allowUpgrade"
                checked={allowUpgrade}
                onChange={(e) => setAllowUpgrade(e.target.checked)}
              />
              <Label htmlFor="allowUpgrade" className="cursor-pointer">يسمح العميل بترقية المركبة</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox" id="isFlexibleTime"
                checked={isFlexibleTime}
                onChange={(e) => setIsFlexibleTime(e.target.checked)}
              />
              <Label htmlFor="isFlexibleTime" className="cursor-pointer">الوقت مرن</Label>
            </div>
            {/* #1812 unified-dates — DateField mode="datetime" replaces
                the native <input type="datetime-local">. */}
            <DateField
              label="نافذة التحميل — من" mode="datetime"
              value={pickupWindowStart}
              onChange={setPickupWindowStart}
            />
            <DateField
              label="نافذة التحميل — إلى" mode="datetime"
              value={pickupWindowEnd}
              onChange={setPickupWindowEnd}
            />
            <DateField
              label="نافذة التسليم — من" mode="datetime"
              value={dropoffWindowStart}
              onChange={setDropoffWindowStart}
            />
            <DateField
              label="نافذة التسليم — إلى" mode="datetime"
              value={dropoffWindowEnd}
              onChange={setDropoffWindowEnd}
            />
            <DateField
              label="موعد ثابت (إن وجد)" mode="datetime"
              value={fixedAppointmentTime}
              onChange={setFixedAppointmentTime}
            />
            <div>
              <Label>الأولوية (0 = عادي، أعلى = أهم)</Label>
              <Input type="number" min={0}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
            </div>
          </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">ملاحظات</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="ملاحظات تشغيلية للسائق أو المشرف…" />
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 justify-end">
          <Link href="/fleet/transport/bookings">
            <Button type="button" variant="outline">إلغاء</Button>
          </Link>
          <Button type="submit" disabled={submitting || !hasLinkedSource} rateLimitAware>
            <Plus className="h-4 w-4 me-1" />
            {submitting ? "جاري الإنشاء…" : "إنشاء الحجز"}
          </Button>
        </div>
      </form>
    </PageShell>
  );
}
