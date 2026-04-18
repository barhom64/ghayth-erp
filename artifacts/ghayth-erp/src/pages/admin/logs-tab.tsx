import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateAr } from "@/lib/formatters";

export function LogsTab() {
  const { data, isLoading, isError } = useApiQuery<any>(["admin-logs"], "/settings/audit-log");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const items = data?.data || [];
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">سجلات النظام</h3>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-gray-50"><th className="p-3 text-start">المستخدم</th><th className="p-3 text-start">الإجراء</th><th className="p-3 text-start">الوحدة</th><th className="p-3 text-start">التاريخ</th></tr></thead>
          <tbody>
            {items.map((l: any) => (
              <tr key={l.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">{l.userName || "-"}</td>
                <td className="p-3">{l.action || "-"}</td>
                <td className="p-3 text-gray-500">{l.module || "-"}</td>
                <td className="p-3 text-xs text-gray-400">{l.createdAt ? formatDateAr(l.createdAt) : "-"}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-gray-400">لا توجد سجلات</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
