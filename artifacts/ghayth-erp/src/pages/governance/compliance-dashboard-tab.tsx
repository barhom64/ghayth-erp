import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@workspace/ui-core";
import { formatDateAr } from "@/lib/formatters";

export function ComplianceDashboardTab() {
  const { data: dashResp, isLoading, isError } = useApiQuery<any>(["gov-compliance-dashboard"], "/governance/compliance-dashboard");
  const dash = dashResp || {};

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-4">
      <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-0 shadow-sm"><CardContent className="p-4"><p className="text-2xl font-bold text-status-success-foreground">{dash.compliant || 0}</p><p className="text-xs text-muted-foreground">ممتثل</p></CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4"><p className="text-2xl font-bold text-status-error-foreground">{dash.nonCompliant || 0}</p><p className="text-xs text-muted-foreground">غير ممتثل</p></CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4"><p className="text-2xl font-bold text-status-warning-foreground">{dash.partial || 0}</p><p className="text-xs text-muted-foreground">جزئي</p></CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4"><p className="text-2xl font-bold text-status-info-foreground">{dash.complianceRate || 0}%</p><p className="text-xs text-muted-foreground">معدل الامتثال</p></CardContent></Card>
          </div>
          {(dash.byModule || []).length > 0 && (
            <Card>
              <CardHeader><CardTitle>الامتثال حسب الوحدة</CardTitle></CardHeader>
              <CardContent>
                <DataTable
                  columns={[
                    { key: "module", header: "الوحدة", sortable: true, searchable: true, render: (m: any) => <span className="font-medium">{m.module}</span> },
                    { key: "compliant", header: "ممتثل", sortable: true, render: (m: any) => <span className="text-status-success-foreground">{m.compliant}</span> },
                    { key: "nonCompliant", header: "غير ممتثل", sortable: true, render: (m: any) => <span className="text-status-error-foreground">{m.nonCompliant}</span> },
                    { key: "partial", header: "جزئي", sortable: true, render: (m: any) => <span className="text-status-warning-foreground">{m.partial}</span> },
                    {
                      key: "rate", header: "معدل الامتثال", sortable: true,
                      render: (m: any) => (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-surface-subtle rounded-full">
                            <div className="h-2 bg-status-success-surface0 rounded-full" style={{ width: `${m.rate || 0}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-8">{m.rate}%</span>
                        </div>
                      ),
                    },
                  ]}
                  data={dash.byModule || []}
                  rowKey={(m: any) => m.module}
                  noToolbar
                  pageSize={0}
                />
              </CardContent>
            </Card>
          )}
          {(dash.overdueActions || []).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-status-error-foreground">إجراءات امتثال متأخرة</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(dash.overdueActions || []).map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between p-2 bg-status-error-surface rounded-lg">
                      <div>
                        <p className="text-sm font-medium">{a.title}</p>
                        <p className="text-xs text-muted-foreground">{a.regulation} — {a.owner}</p>
                      </div>
                      <Badge variant="destructive" className="text-xs">{formatDateAr(a.dueDate)}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
      </>
    </div>
  );
}
