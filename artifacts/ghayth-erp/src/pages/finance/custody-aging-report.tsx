import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, AlertTriangle, DollarSign, Users, KeyRound, ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency, formatNumber , formatDateAr } from "@/lib/formatters";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

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
            <p className="text-xs text-gray-500">إجمالي المعلّق</p>
            <p className="text-xl font-bold text-orange-600">{formatCurrency(Number(summary.totalOutstanding || 0))}</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
          <div>
            <p className="text-xs text-gray-500">مبالغ متأخرة</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(Number(summary.totalOverdue || 0))}</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg"><Users className="h-5 w-5 text-blue-600" /></div>
          <div>
            <p className="text-xs text-gray-500">عدد الموظفين</p>
            <p className="text-xl font-bold">{formatNumber(summary.employeeCount || 0)}</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg"><KeyRound className="h-5 w-5 text-purple-600" /></div>
          <div>
            <p className="text-xs text-gray-500">عهد معلّقة</p>
            <p className="text-xl font-bold">{formatNumber(summary.totalCustodies || 0)}</p>
          </div>
        </CardContent></Card>
      </div>

      {employees.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-gray-400">
          <KeyRound className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>لا توجد عهد معلّقة</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {employees.map((emp: any) => {
            const isExpanded = expandedEmployee === emp.employeeName;
            return (
              <Card key={emp.employeeName} className={emp.overdueCount > 0 ? "border-red-200" : ""}>
                <CardContent className="p-0">
                  <button
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-right"
                    onClick={() => setExpandedEmployee(isExpanded ? null : emp.employeeName)}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      <div>
                        <p className="font-semibold">{emp.employeeName}</p>
                        <p className="text-xs text-gray-500">{emp.custodyCount} عهدة معلّقة</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {emp.overdueCount > 0 && (
                        <Badge className="bg-red-100 text-red-700">
                          <AlertTriangle className="h-3 w-3 me-1" />
                          {emp.overdueCount} متأخرة
                        </Badge>
                      )}
                      <div className="text-end">
                        <p className="font-bold text-orange-600">{formatCurrency(emp.totalOutstanding)}</p>
                        {emp.overdueAmount > 0 && (
                          <p className="text-xs text-red-500">متأخر: {formatCurrency(emp.overdueAmount)}</p>
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
                              <span className="font-mono text-blue-600 text-xs hover:underline cursor-pointer">{c.ref}</span>
                            </Link>
                          )},
                          { key: "description", header: "الوصف", render: (c: any) => (
                            <div className="text-gray-600">
                              {c.description || "-"}
                              {c.purpose && <div className="text-xs text-gray-400">{c.purpose}</div>}
                            </div>
                          )},
                          { key: "amount", header: "المبلغ", render: (c: any) => <span className="font-semibold">{formatCurrency(c.amount)}</span> },
                          { key: "settledAmount", header: "المسوّى", render: (c: any) => <span className="text-green-600">{formatCurrency(c.settledAmount)}</span> },
                          { key: "remainingAmount", header: "المتبقي", render: (c: any) => <span className="font-semibold text-orange-600">{formatCurrency(c.remainingAmount)}</span> },
                          { key: "date", header: "التاريخ", render: (c: any) => <span className="text-gray-500 text-xs">{c.date ? formatDateAr(c.date) : "-"}</span> },
                          { key: "expectedReturnDate", header: "تاريخ الإرجاع", render: (c: any) => c.expectedReturnDate ? (
                            <span className={c.isOverdue ? "text-red-600 font-semibold" : "text-gray-500"}>
                              {formatDateAr(c.expectedReturnDate)}
                            </span>
                          ) : "-" },
                          { key: "daysOverdue", header: "أيام التأخير", render: (c: any) => c.daysOverdue > 0 ? (
                            <Badge className="bg-red-100 text-red-700 text-xs">{c.daysOverdue} يوم</Badge>
                          ) : <span className="text-gray-400">-</span> },
                        ]}
                        data={emp.custodies}
                        rowClassName={(c: any) => c.isOverdue ? "bg-red-50/30" : ""}
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
