// HR dashboard for employees who haven't completed their personal
// data after a quick-create onboarding. Driven by predicated index
// 250 (idx_employees_pending_profile) so the lookup stays fast even
// at 10k+ employees.

import { Link } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { formatDateAr } from "@/lib/formatters";
import { Mail, Building2, Clock } from "lucide-react";

export default function HrPendingProfilePage() {
  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["pending-profile-employees"],
    "/employees/pending-profile",
  );
  const rows = asList(data?.data || data);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <PageShell
      title="موظفون في انتظار استكمال البيانات"
      subtitle="موظفون أُضيفوا عبر الإضافة السريعة ولم يكملوا بياناتهم الشخصية بعد"
      breadcrumbs={[
        { label: "الموارد البشرية", href: "/hr" },
        { label: "قائمة الاستكمال" },
      ]}
    >
      <HrTabsNav />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm font-medium">لا أحد في الانتظار</p>
            <p className="text-xs text-muted-foreground mt-1">جميع الموظفين أكملوا بياناتهم الشخصية.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              في الانتظار ({rows.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs">
                  <tr>
                    <th className="text-right p-2">الموظف</th>
                    <th className="text-right p-2">المسمى الوظيفي</th>
                    <th className="text-right p-2">الفرع</th>
                    <th className="text-right p-2">البريد الداخلي</th>
                    <th className="text-right p-2">تاريخ الدعوة</th>
                    <th className="text-right p-2">الأيام منذ الدعوة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => {
                    const daysSince = r.invitedAt
                      ? Math.floor((Date.now() - new Date(r.invitedAt).getTime()) / (24 * 60 * 60 * 1000))
                      : null;
                    const isStale = daysSince !== null && daysSince >= 7;
                    return (
                      <tr key={r.id} className="border-t hover:bg-muted/20">
                        <td className="p-2">
                          <Link href={`/employees/${r.id}`}>
                            <a className="font-medium text-primary underline-offset-2 hover:underline">{r.name}</a>
                          </Link>
                          {r.empNumber && <p className="text-[10px] text-muted-foreground font-mono">#{r.empNumber}</p>}
                        </td>
                        <td className="p-2 text-muted-foreground">{r.jobTitle || "—"}</td>
                        <td className="p-2 text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {r.branchName || "—"}
                          </span>
                        </td>
                        <td className="p-2 text-muted-foreground">
                          <span className="inline-flex items-center gap-1 font-mono text-xs" dir="ltr">
                            <Mail className="h-3 w-3" />
                            {r.internalEmail || "—"}
                          </span>
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {r.invitedAt ? formatDateAr(r.invitedAt) : "—"}
                        </td>
                        <td className="p-2">
                          {daysSince !== null && (
                            <Badge
                              variant={isStale ? "secondary" : "outline"}
                              className={`text-[10px] ${isStale ? "bg-status-warning-surface text-status-warning-foreground" : ""}`}
                            >
                              <Clock className="h-3 w-3 ml-1" />
                              {daysSince} يوم
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
