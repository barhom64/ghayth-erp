import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Clock, MapPin, AlertTriangle } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  present: "حاضر",
  absent: "غائب",
  late: "متأخر",
  early_leave: "انصراف مبكر",
  excused: "مستأذن",
  on_leave: "في إجازة",
};

const METHOD_LABELS: Record<string, string> = {
  manual: "يدوي",
  biometric: "بصمة",
  qr: "رمز QR",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "present") return "success" as const;
  if (["absent"].includes(status)) return "destructive" as const;
  if (["late", "early_leave"].includes(status)) return "warning" as const;
  if (["excused", "on_leave"].includes(status)) return "info" as const;
  return "default" as const;
}

export default function AttendanceDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/hr/attendance/:id");
  const id = params?.id ? Number(params.id) : null;

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["attendance", String(id)],
    id ? `/hr/attendance/${id}` : null,
    !!id
  );

  const record = data;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!record) return out;
    if (record.employeeId) {
      out.push({
        type: "employee",
        id: record.employeeId,
        label: record.employeeName || `موظف #${record.employeeId}`,
        sublabel: "الموظف",
        href: `/employees/${record.employeeId}`,
      });
    }
    return out;
  }, [record]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!record) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم المرجع", value: `ATT-${id}` },
          { label: "الموظف", value: record.employeeName || "-" },
          { label: "التاريخ", value: formatDateAr(record.date) },
          { label: "وقت الحضور", value: record.checkIn || "-" },
          { label: "وقت الانصراف", value: record.checkOut || "-" },
          { label: "إجمالي الساعات", value: record.totalHours ? `${record.totalHours} ساعة` : "-" },
          { label: "الحالة", value: STATUS_LABELS[record.status] || record.status || "-" },
          ...(record.overtimeHours ? [{ label: "ساعات إضافية", value: `${record.overtimeHours} ساعة` }] : []),
          ...(record.lateMinutes ? [{ label: "دقائق التأخير", value: `${record.lateMinutes} دقيقة` }] : []),
          ...(record.earlyMinutes ? [{ label: "دقائق الانصراف المبكر", value: `${record.earlyMinutes} دقيقة` }] : []),
          ...(record.method ? [{ label: "طريقة التسجيل", value: METHOD_LABELS[record.method] || record.method }] : []),
        ],
      },
    ];
    if (record.notes) {
      sections.push({ kind: "text", title: "ملاحظات", body: record.notes });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "الموظف", name: record.employeeName || "" },
        { label: "المسؤول", name: record.createdByName || "" },
      ],
    });
    return sections;
  }, [record, id]);

  const handleEdit = () => {
    setLocation(`/hr/attendance/${id}/edit`);
  };

  const isWarningStatus = record?.status === "late" || record?.status === "absent";

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Primary info */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-500" />
            بيانات الحضور
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Employee name hero */}
          <div className="flex items-baseline gap-2 border-b pb-3">
            <span className="text-xl font-bold text-gray-900">
              {record?.employeeName || "-"}
            </span>
            {isWarningStatus && (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {record?.date && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">التاريخ</p>
                <span className="text-gray-800">{formatDateAr(record.date)}</span>
              </div>
            )}
            {record?.status && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">الحالة</p>
                <Badge
                  variant="outline"
                  className={cn(
                    isWarningStatus && "border-amber-400 bg-amber-50 text-amber-700"
                  )}
                >
                  {STATUS_LABELS[record.status] || record.status}
                </Badge>
              </div>
            )}
            {record?.checkIn && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">وقت الحضور</p>
                <span className="text-gray-800 font-mono">{record.checkIn}</span>
              </div>
            )}
            {record?.checkOut && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">وقت الانصراف</p>
                <span className="text-gray-800 font-mono">{record.checkOut}</span>
              </div>
            )}
            {record?.totalHours != null && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">إجمالي الساعات</p>
                <span className="text-gray-800">{record.totalHours} ساعة</span>
              </div>
            )}
            {record?.overtimeHours != null && Number(record.overtimeHours) > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">ساعات إضافية</p>
                <span className="text-green-700 font-medium">{record.overtimeHours} ساعة</span>
              </div>
            )}
            {record?.lateMinutes != null && Number(record.lateMinutes) > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">دقائق التأخير</p>
                <span className="text-amber-600 font-medium">{record.lateMinutes} دقيقة</span>
              </div>
            )}
            {record?.earlyMinutes != null && Number(record.earlyMinutes) > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">دقائق الانصراف المبكر</p>
                <span className="text-amber-600 font-medium">{record.earlyMinutes} دقيقة</span>
              </div>
            )}
            {record?.method && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">طريقة التسجيل</p>
                <Badge variant="secondary">
                  {METHOD_LABELS[record.method] || record.method}
                </Badge>
              </div>
            )}
            {record?.location && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">الموقع</p>
                <span className="text-gray-800 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {record.location}
                </span>
              </div>
            )}
          </div>

          {record?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">ملاحظات</p>
              <p className="text-gray-800 whitespace-pre-wrap">{record.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Summary card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">ملخص اليوم</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">الحضور</span>
              <span className="font-mono">{record?.checkIn || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">الانصراف</span>
              <span className="font-mono">{record?.checkOut || "-"}</span>
            </div>
            <hr className="border-gray-200" />
            <div className="flex justify-between font-medium">
              <span className="text-gray-600">الإجمالي</span>
              <span>{record?.totalHours ? `${record.totalHours} ساعة` : "-"}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  return (
    <DetailPageLayout
      title={`سجل حضور ATT-${id}`}
      subtitle={record?.employeeName}
      backPath="/hr/attendance"
      refNumber={`ATT-${id}`}
      status={
        record
          ? { label: STATUS_LABELS[record.status] || record.status || "-", tone: statusTone(record.status) }
          : undefined
      }
      typeLabel={record?.method ? METHOD_LABELS[record.method] || record.method : undefined}
      createdAt={record?.createdAt || record?.date}
      updatedAt={record?.updatedAt}
      createdByName={record?.createdByName}
      relatedEntities={relatedEntities}
      entityType="attendance"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {record && (
            <EntityPrintButton
              branchId={record.branchId}
              title={`سجل حضور ATT-${id}`}
              ref={`ATT-${id}`}
              date={formatDateAr(record.date || record.createdAt)}
              sections={printSections}
            />
          )}
          <GuardedButton
            perm="hr:update"
            variant="outline"
            size="sm"
            onClick={handleEdit}
            disabled={!record}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
