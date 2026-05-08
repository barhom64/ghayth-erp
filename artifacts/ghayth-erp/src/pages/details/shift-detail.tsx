import { useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import { DetailPageLayout } from "@/components/shared/detail-page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";

export default function ShiftDetail() {
  const [, params] = useRoute("/hr/shifts/:id");
  const id = params?.id ? Number(params.id) : null;

  // Shifts have no GET /:id endpoint — fetch the list and find by id.
  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["shifts"],
    "/hr/shifts",
    !!id
  );
  const list = (data?.data ?? data) as any[] | undefined;
  const shift = Array.isArray(list) ? list.find((s: any) => String(s.id) === String(id)) : null;

  const editDelete = useDetailEditDelete({
    entityLabel: "الوردية",
    patchPath: `/hr/shifts/${id}`,
    deletePath: `/hr/shifts/${id}`,
    listPath: "/hr/shifts",
    initialValues: shift,
    fields: [
      { key: "name", label: "اسم الوردية" },
      { key: "startTime", label: "وقت البداية" },
      { key: "endTime", label: "وقت النهاية" },
      { key: "notes", label: "ملاحظات" },
    ],
    invalidateKeys: [["shift", String(id)], ["shifts"]],
    onSaved: () => refetch(),
  });

  const overview = (
    <div className="space-y-4">
      <InlineEditCard hook={editDelete} />
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-500" />
            بيانات الوردية
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-gray-500">الاسم:</span> {shift?.name || "—"}</div>
            <div><span className="text-gray-500">من:</span> {shift?.startTime || "—"}</div>
            <div><span className="text-gray-500">إلى:</span> {shift?.endTime || "—"}</div>
            <div><span className="text-gray-500">أنشئت:</span> {shift?.createdAt ? formatDateAr(shift.createdAt) : "—"}</div>
          </div>
          {shift?.notes && <div className="pt-2 border-t"><span className="text-gray-500">ملاحظات:</span> {shift.notes}</div>}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <DetailPageLayout
      title={shift?.name || "الوردية"}
      backPath="/hr/shifts"
      backLabel="العودة"
      entityType="shift"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={<DetailActionButtons hook={editDelete} />}
    />
  );
}
