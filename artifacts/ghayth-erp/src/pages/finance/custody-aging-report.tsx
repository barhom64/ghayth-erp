import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, AlertTriangle, DollarSign, Users, KeyRound, ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency, formatNumber , formatDateAr } from "@/lib/formatters";
import {
  PageShell,
  DataTable,
} from "@workspace/ui-core";

export default function CustodyAgingReportPage() {
  const { data, isLoading, isError } = useApiQuery<any>(["custody-aging-report"], "/finance/custodies/report");
  const employees = data?.data || [];
  const summary = data?.summary || {};
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="تقرير أعمار العهد"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/custodies", label: "العهد" },
        { label: "تقرير أعمار العهد" },
      ]}
      loading={isLoading}
      actions={
        <Link href="/finance/custodies">
          <Button variant="ghost" size="sm"><ArrowRight className="h-4 w-4 me-1" />العهد</Button>
        </Link>
      }
    >
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg"><DollarSign className="h-5 w-5 text-orange-600" /></div>
          <div>
            <p className="text-xs text-muted-foreground">إجمالي المعلّق</p>
            <p className="text-xl font-bold text-orange-600">{formatCurrency(Number(summary.totalOutstanding || 0))}</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-status-error-surface rounded-lg"><AlertTriangle className="h-5 w-5 text-status-error-foreground" /></div>
          <div>
            <p className="text-xs text-muted-foreground">مبالغ متأخرة</p>
            <p className="text-xl font-bold text-status-error-foreground">{formatCurrency(Number(summary.totalOverdue || 0))}</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-status-info-surface rounded-lg"><Users className="h-5 w-5 text-status-info-foreground" /></div>
          <div>
            <p className="text-xs text-muted-foreground">عدد الموظفين</p>
            <p className="text-xl font-bold">{formatNumber(summary.employeeCount || 0)}</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg"><KeyRound className="h-5 w-5 text-purple-600" /></div>
          <div>
            <p className="text-xs text-muted-foreground">عهد معلّقة</p>
            <p className="text-xl font-bold">{formatNumber(summary.totalCustodies || 0)}</p>
          </div>
        </CardContent></Card>
      </div>

      {employees.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <KeyRound className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>لا توجد عهد معلّقة</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {employees.map((emp: any) => {
            const isExpanded = expandedEmployee === emp.employeeName;
            return (
              <Card key={emp.employeeName} className={emp.overdueCount > 0 ? "border-status-error-surface" : ""}>
                <CardContent className="p-0">
                  <button
                    className="w-full flex items-center justify-between p-4 hover:bg-surface-subtle transition-colors text-right"
                    onClick={() => setExpandedEmployee(isExpanded ? null : emp.employeeName)}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <div>
                        <p className="font-semibold">{emp.employeeName}</p>
                        <p className="text-xs text-muted-foreground">{emp.custodyCount} عهدة معلّقة</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {emp.overdueCount > 0 && (
                        <Badge className="bg-status-error-surface text-status-error-foreground">
                          <AlertTriangle className="h-3 w-3 me-1" />
                          {emp.overdueCount} متأخرة
                        </Badge>
                      )}
                      <div className="text-end">
                        <p className="font-bold text-orange-600">{formatCurrency(emp.totalOutstanding)}</p>
                        {emp.overdueAmount > 0 && (
                          <p className="text-xs text-status-error">متأخر: {formatCurrency(emp.overdueAmount)}</p>
                        )}
                      </div>
                    </div>
                  </button>

                  {isExpanded && emp.custodies && (
                    <div className="border-t">
                      <DataTable
                        columns={[
                          { key: "ref", header: "المرجع", render: (c: any) => (
                            <Link href={`/finance/custodies/${c.id}`}>
                              <span className="font-mono text-status-info-foreground text-xs hover:underline cursor-pointer">{c.ref}</span>
                            </Link>
                          )},
                          { key: "description", header: "الوصف", render: (c: any) => (
                            <div className="text-muted-foreground">
                              {c.description || "-"}
                              {c.purpose && <div className="text-xs text-muted-foreground">{c.purpose}</div>}
                            </div>
                          )},
                          { key: "amount", header: "المبلغ", render: (c: any) => <span className="font-semibold">{formatCurrency(c.amount)}</span> },
                          { key: "settledAmount", header: "المسوّى", render: (c: any) => <span className="text-status-success-foreground">{formatCurrency(c.settledAmount)}</span> },
                          { key: "remainingAmount", header: "المتبقي", render: (c: any) => <span className="font-semibold text-orange-600">{formatCurrency(c.remainingAmount)}</span> },
                          { key: "date", header: "التاريخ", render: (c: any) => <span className="text-muted-foreground text-xs">{c.date ? formatDateAr(c.date) : "-"}</span> },
                          { key: "expectedReturnDate", header: "تاريخ الإرجاع", render: (c: any) => c.expectedReturnDate ? (
                            <span className={c.isOverdue ? "text-status-error-foreground font-semibold" : "text-muted-foreground"}>
                              {formatDateAr(c.expectedReturnDate)}
                            </span>
                          ) : "-" },
                          { key: "daysOverdue", header: "أيام التأخير", render: (c: any) => c.daysOverdue > 0 ? (
                            <Badge className="bg-status-error-surface text-status-error-foreground text-xs">{c.daysOverdue} يوم</Badge>
                          ) : <span className="text-muted-foreground">-</span> },
                        ]}
                        data={emp.custodies}
                        rowClassName={(c: any) => c.isOverdue ? "bg-status-error-surface" : ""}
                        noToolbar
                        pageSize={0}
                        searchPlaceholder={null}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
