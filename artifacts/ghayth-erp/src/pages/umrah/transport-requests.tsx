/**
 * Umrah Transport Requests — M4 of U-02b (#2080).
 *
 * Operational entry point for the unified Service Contract path
 * (`POST /umrah/groups/:id/transport-requests`, PR #1902 / §7 of
 * #1870). One screen that lets a dispatcher:
 *
 *   1. Pick the umrah group the trip belongs to.
 *   2. Submit a transport request — fromLocation/toLocation +
 *      optional date, route type, vehicle type hint, flight number,
 *      passenger count, notes.
 *   3. See the existing transport_bookings rows for the same group
 *      (read via GET /umrah/groups/:id/transport-requests, the
 *      contract's read-side helper).
 *
 * What this page is NOT in M4:
 *   • Not linked from the sidebar / tabs / calendar yet — M5 owns
 *     that switchover.
 *   • Not a replacement for the legacy `/umrah/transport` screen,
 *     which still writes to the (soon-to-be-frozen) legacy table.
 *     The legacy screen stays open until M5/M6 cut over.
 *   • Not a list-of-all-companies report — that already lives at
 *     /umrah/reports/transport-requests.
 *
 * The page deliberately exercises ONLY the contract endpoints. It
 * never hits the legacy `/umrah/transport` route in any shape.
 * Smoke `umrahTransportRequestsPageSmoke` pins that.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { statusLabel } from "@/lib/transport-status-labels";
import { PageShell } from "@workspace/ui-core";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Bus } from "lucide-react";

interface GroupOption {
  id: number;
  name: string | null;
  nuskGroupNumber: string | null;
  seasonTitle: string | null;
}

interface TransportRequestRow {
  transportRequestId: number;
  tripId: number | null;
  vehicleId: number | null;
  driverId: number | null;
  status: string;
  estimatedCost: number | null;
  actualCost: number | null;
}

// #TA-T18-UX-AUDIT-01 UX-05 — حالات طلب النقل العشر مطابقة لحالات الحجز
// القانونية، فتُعرض من القاموس الموحّد (lib/transport-status-labels) بدل
// خريطتين محليتين كانتا تسقطان لقيمة إنجليزية خام.

const ROUTE_TYPE_LABEL_AR: Record<string, string> = {
  airport_to_makkah: "مطار → مكة",
  makkah_to_madinah: "مكة → المدينة",
  madinah_to_airport: "المدينة → مطار",
  makkah_local: "تنقل داخل مكة",
  madinah_local: "تنقل داخل المدينة",
  ziyarah: "زيارة",
  custom: "مخصص",
};

interface FormState {
  fromLocation: string;
  toLocation: string;
  dateTime: string;
  routeType: string;
  requiredVehicleType: string;
  flightNumber: string;
  pilgrimsCount: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  fromLocation: "",
  toLocation: "",
  dateTime: "",
  routeType: "",
  requiredVehicleType: "",
  flightNumber: "",
  pilgrimsCount: "",
  notes: "",
};

export default function UmrahTransportRequestsPage() {
  const [groupId, setGroupId] = useState<string>("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const groupsQ = useApiQuery<{ data: GroupOption[] }>(
    ["umrah-groups-options"],
    "/umrah/groups",
  );
  const groups = groupsQ.data?.data ?? [];

  const requestsQ = useApiQuery<{ data: TransportRequestRow[] }>(
    ["umrah-group-transport-requests", groupId],
    groupId ? `/umrah/groups/${groupId}/transport-requests` : null,
  );
  const rows = requestsQ.data?.data ?? [];

  const createMut = useApiMutation<unknown, Record<string, unknown>>(
    () => `/umrah/groups/${groupId}/transport-requests`,
    "POST",
    [
      ["umrah-group-transport-requests", groupId],
    ],
    {
      successMessage: "تم إنشاء طلب النقل عبر العقد الموحّد",
      onSuccess: () => setForm(EMPTY_FORM),
    },
  );

  const canSubmit = useMemo(
    () =>
      !!groupId &&
      form.fromLocation.trim().length > 0 &&
      form.toLocation.trim().length > 0 &&
      !createMut.isPending,
    [groupId, form.fromLocation, form.toLocation, createMut.isPending],
  );

  const submit = () => {
    if (!canSubmit) return;
    const body: Record<string, unknown> = {
      fromLocation: form.fromLocation.trim(),
      toLocation: form.toLocation.trim(),
    };
    if (form.dateTime) body.dateTime = form.dateTime;
    if (form.routeType) body.routeType = form.routeType;
    if (form.requiredVehicleType.trim())
      body.requiredVehicleType = form.requiredVehicleType.trim();
    if (form.flightNumber.trim()) body.flightNumber = form.flightNumber.trim();
    if (form.pilgrimsCount) body.pilgrimsCount = Number(form.pilgrimsCount);
    if (form.notes.trim()) body.notes = form.notes.trim();
    createMut.mutate(body);
  };

  return (
    <PageShell
      title="طلبات النقل عبر العقد الموحّد"
      subtitle="المسار الموحَّد لربط العمرة بأسطول النقل."
      breadcrumbs={[
        { href: "/umrah", label: "إدارة العمرة" },
        { label: "طلبات النقل (العقد الموحّد)" },
      ]}
    >
      <UmrahTabsNav />
      <Card>
        <CardContent className="p-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 min-w-[260px]">
              <Label className="text-xs text-muted-foreground">المجموعة</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger
                  className="w-[280px]"
                  data-testid="transport-requests-group-select"
                >
                  <SelectValue placeholder="اختر مجموعة" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => {
                    const label =
                      g.name ?? g.nuskGroupNumber ?? `مجموعة #${g.id}`;
                    return (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {label}
                        {g.seasonTitle ? ` — ${g.seasonTitle}` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            {groupId && (
              <Link
                href={`/umrah/groups/${groupId}`}
                className="text-sm text-blue-600 hover:underline"
              >
                فتح صفحة المجموعة ←
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      {groupId && (
        <Card>
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-3 flex items-center gap-2 text-sm font-semibold">
              <Bus className="h-4 w-4 text-muted-foreground" />
              طلب نقل جديد لهذه المجموعة
            </div>
            <div>
              <Label>من *</Label>
              <Input
                data-testid="transport-requests-from"
                value={form.fromLocation}
                onChange={(e) =>
                  setForm({ ...form, fromLocation: e.target.value })
                }
                placeholder="مطار جدة"
              />
            </div>
            <div>
              <Label>إلى *</Label>
              <Input
                data-testid="transport-requests-to"
                value={form.toLocation}
                onChange={(e) =>
                  setForm({ ...form, toLocation: e.target.value })
                }
                placeholder="مكة المكرمة"
              />
            </div>
            <div>
              <Label>تاريخ/وقت الالتقاط</Label>
              <Input
                type="datetime-local"
                value={form.dateTime}
                onChange={(e) =>
                  setForm({ ...form, dateTime: e.target.value })
                }
              />
            </div>
            <div>
              <Label>نوع المسار</Label>
              <Select
                value={form.routeType || "unset"}
                onValueChange={(v) =>
                  setForm({ ...form, routeType: v === "unset" ? "" : v })
                }
              >
                <SelectTrigger data-testid="transport-requests-route-type">
                  <SelectValue placeholder="غير محدد" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">غير محدد</SelectItem>
                  {Object.entries(ROUTE_TYPE_LABEL_AR).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>نوع المركبة المطلوب</Label>
              <Input
                value={form.requiredVehicleType}
                onChange={(e) =>
                  setForm({ ...form, requiredVehicleType: e.target.value })
                }
                placeholder="باص 50"
              />
            </div>
            <div>
              <Label>رقم الرحلة</Label>
              <Input
                value={form.flightNumber}
                onChange={(e) =>
                  setForm({ ...form, flightNumber: e.target.value })
                }
                placeholder="SV1234"
              />
            </div>
            <div>
              <Label>عدد المعتمرين</Label>
              <Input
                type="number"
                value={form.pilgrimsCount}
                onChange={(e) =>
                  setForm({ ...form, pilgrimsCount: e.target.value })
                }
              />
            </div>
            <div className="md:col-span-3">
              <Label>ملاحظات</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="md:col-span-3 flex justify-end">
              <Button
                onClick={submit}
                disabled={!canSubmit}
                data-testid="transport-requests-submit"
              >
                إنشاء عبر العقد الموحّد
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {groupId && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {requestsQ.isLoading ? (
              <LoadingSpinner />
            ) : requestsQ.isError ? (
              <ErrorState onRetry={requestsQ.refetch} />
            ) : rows.length === 0 ? (
              <p
                className="text-sm text-muted-foreground py-12 text-center"
                data-testid="transport-requests-empty"
              >
                لا توجد طلبات نقل مرتبطة بهذه المجموعة عبر العقد الموحّد بعد.
              </p>
            ) : (
              <div className="overflow-x-auto"><table
                className="w-full text-sm"
                data-testid="transport-requests-table"
              >
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-start">رقم الطلب</th>
                    <th className="p-2 text-start">المركبة</th>
                    <th className="p-2 text-start">السائق</th>
                    <th className="p-2 text-end">التكلفة التقديرية</th>
                    <th className="p-2 text-end">التكلفة الفعلية</th>
                    <th className="p-2 text-start">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const tone = statusLabel("booking", r.status).tone;
                    return (
                      <tr
                        key={r.transportRequestId}
                        className="border-t hover:bg-muted/20"
                        data-testid={`transport-requests-row-${r.transportRequestId}`}
                      >
                        <td className="p-2 font-mono text-xs">
                          #{r.transportRequestId}
                        </td>
                        <td className="p-2">{r.vehicleId ?? "—"}</td>
                        <td className="p-2">{r.driverId ?? "—"}</td>
                        <td className="p-2 text-end font-mono">
                          {r.estimatedCost ?? "—"}
                        </td>
                        <td className="p-2 text-end font-mono">
                          {r.actualCost ?? "—"}
                        </td>
                        <td className="p-2">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded border whitespace-nowrap ${tone}`}
                          >
                            {statusLabel("booking", r.status).label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            )}
          </CardContent>
        </Card>
      )}

      {groupsQ.isLoading && !groupId && <LoadingSpinner />}
    </PageShell>
  );
}
