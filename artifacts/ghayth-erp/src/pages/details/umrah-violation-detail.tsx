import { useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import { DetailPageLayout } from "@/components/shared/detail-page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";

export default function UmrahViolationDetail() {
  const [, params] = useRoute("/umrah/violations/:id");
  const id = params?.id ? Number(params.id) : null;

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["umrah-violation", String(id)],
    id ? `/umrah/violations/${id}` : null,
    !!id
  );
  const violation = data?.data ?? data;

  const editDelete = useDetailEditDelete({
    entityLabel: "المخالفة",
    patchPath: `/umrah/violations/${id}`,
    deletePath: `/umrah/violations/${id}`,
    listPath: "/umrah/violations",
    initialValues: violation,
    fields: [
      { key: "description", label: "الوصف" },
      { key: "violationType", label: "نوع المخالفة" },
      { key: "fineAmount", label: "قيمة الغرامة", type: "number" },
      { key: "notes", label: "ملاحظات" },
    ],
    invalidateKeys: [["umrah-violation", String(id)], ["umrah-violations"]],
    onSaved: () => refetch(),
  });

  const overview = (
    <div className="space-y-4">
      <InlineEditCard hook={editDelete} />
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-gray-500" />
            بيانات المخالفة
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-gray-500">النوع:</span> {violation?.violationType || "—"}</div>
            <div><span className="text-gray-500">الغرامة:</span> {violation?.fineAmount ?? "—"}</div>
            <div><span className="text-gray-500">التاريخ:</span> {violation?.createdAt ? formatDateAr(violation.createdAt) : "—"}</div>
            <div><span className="text-gray-500">الحالة:</span> {violation?.status || "—"}</div>
          </div>
          {violation?.description && <div className="pt-2 border-t"><span className="text-gray-500">الوصف:</span> {violation.description}</div>}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <DetailPageLayout
      title={`مخالفة ${violation?.violationType || ""}`}
      backPath="/umrah/violations"
      backLabel="العودة"
      entityType="violation"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={<DetailActionButtons hook={editDelete} />}
    />
  );
}
