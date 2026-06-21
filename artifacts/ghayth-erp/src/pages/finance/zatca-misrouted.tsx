import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageShell } from "@workspace/ui-core";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { AlertTriangle } from "lucide-react";
import { Link } from "wouter";

interface MisroutedRow {
  id: number;
  ref: string;
  total: number | string;
  vatAmount: number | string | null;
  paidAmount: number | string | null;
  zatcaReportedAt: string;
  zatcaUuid: string | null;
  clientId: number | null;
  clientName: string | null;
  clientTaxNumber: string | null;
  createdAt: string;
}

interface MisroutedResponse {
  data: MisroutedRow[];
  total: number;
}

const CREDIT_REASON =
  "إعادة إصدار فاتورة شُحنت خطأً إلى مسار ZATCA المبسّط (B2C) قبل اعتماد الرقم الضريبي للعميل — يجب إعادة إصدارها تحت مسار الفوترة الضريبية (B2B / Standard Clearance) — مهمة #385.";

export default function ZatcaMisroutedPage() {
  const { toast } = useToast();
  const [confirmRow, setConfirmRow] = useState<MisroutedRow | null>(null);

  const queryKey = ["zatca-misrouted-b2c"];
  const { data, isLoading, error, refetch } = useApiQuery<MisroutedResponse>(
    queryKey,
    "/finance/zatca/misrouted-b2c-invoices",
  );

  const creditMut = useApiMutation<
    unknown,
    { invoiceId: number; amount: number; reason: string }
  >(
    (body) => `/finance/invoices/${body.invoiceId}/credit-memo`,
    "POST",
    [queryKey, ["invoices"], ["journal"]],
    {
      successMessage:
        "تم إصدار إشعار دائن — يُرجى إعادة إصدار الفاتورة من شاشة الفواتير",
      onSuccess: () => {
        setConfirmRow(null);
        refetch();
      },
    },
  );

  const rows = data?.data ?? [];

  return (
    <PageShell
      title="فواتير شُحنت خطأً إلى مسار ZATCA B2C"
      subtitle="فواتير ضريبية أُرسلت إلى مسار التبليغ المبسّط (B2C) قبل اعتماد الرقم الضريبي للعميل، ويجب إعادة إصدارها كإشعار دائن + فاتورة جديدة تحت مسار الفوترة الضريبية (B2B)."
    >
      <FinanceTabsNav />
      <Card className="border-orange-200 bg-orange-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-700">
            <AlertTriangle className="w-5 h-5" />
            لماذا تظهر هذه الفواتير؟
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700 leading-7">
          هذه الفواتير مُعلَّمة كـ <b>ضريبية</b> وتم تبليغها فعلاً إلى ZATCA على
          أنها فواتير B2C (تبليغ بسيط) — لكن العميل يحمل الآن رقم تسجيل ضريبي
          صالح، مما يعني أن المسار الصحيح لها هو <b>B2B (Standard Clearance)</b>.
          الإجراء المطلوب: إصدار إشعار دائن لكل فاتورة ثم إعادة إصدارها من شاشة
          الفواتير لتُسلَّك تحت المسار الصحيح.
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>القائمة ({data?.total ?? 0})</CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            تحديث
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingSpinner />
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-sm text-red-600 mb-3">
                تعذّر تحميل القائمة. حاول مرة أخرى.
              </p>
              <Button variant="outline" onClick={() => refetch()}>
                إعادة المحاولة
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-500">
              لا توجد فواتير تحتاج إلى تصحيح. كل الفواتير الضريبية للعملاء
              المسجَّلين سُلِّكت عبر المسار الصحيح.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-right text-gray-600">
                    <th className="py-2 px-2">رقم الفاتورة</th>
                    <th className="py-2 px-2">العميل</th>
                    <th className="py-2 px-2">الرقم الضريبي</th>
                    <th className="py-2 px-2">المبلغ</th>
                    <th className="py-2 px-2">VAT</th>
                    <th className="py-2 px-2">تاريخ التبليغ إلى ZATCA</th>
                    <th className="py-2 px-2">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const total = Number(row.total) || 0;
                    const paid = Number(row.paidAmount) || 0;
                    const open = Math.max(0, total - paid);
                    const isProcessing =
                      creditMut.isPending &&
                      confirmRow?.id === row.id;
                    return (
                      <tr
                        key={row.id}
                        className="border-b hover:bg-gray-50 align-middle"
                      >
                        <td className="py-2 px-2 font-medium">
                          <Link
                            to={`/finance/invoices/${row.id}`}
                            className="text-primary hover:underline"
                          >
                            {row.ref}
                          </Link>
                        </td>
                        <td className="py-2 px-2">{row.clientName ?? "—"}</td>
                        <td className="py-2 px-2 font-mono text-xs">
                          {row.clientTaxNumber ?? "—"}
                        </td>
                        <td className="py-2 px-2">{formatCurrency(total)}</td>
                        <td className="py-2 px-2">
                          {formatCurrency(Number(row.vatAmount) || 0)}
                        </td>
                        <td className="py-2 px-2 text-xs text-gray-600">
                          {formatDateAr(row.zatcaReportedAt)}
                        </td>
                        <td className="py-2 px-2">
                          <Button
                            size="sm"
                            variant="default"
                            disabled={open <= 0 || isProcessing}
                            onClick={() => setConfirmRow(row)}
                          >
                            {open <= 0
                              ? "لا رصيد مفتوح"
                              : "إصدار إشعار دائن + إعادة إصدار"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* GAP_MATRIX P1 UI-unification §6.2 — ConfirmActionDialog replaces raw AlertDialog */}
      <ConfirmActionDialog
        open={confirmRow !== null}
        onOpenChange={(open) => { if (!open && !creditMut.isPending) setConfirmRow(null); }}
        variant="destructive"
        title="تأكيد إصدار إشعار دائن"
        description={
          <>
            سيتم إصدار إشعار دائن للفاتورة{" "}
            <b>{confirmRow?.ref}</b> بكامل الرصيد المفتوح، ثم يجب عليك إعادة
            إصدارها من شاشة الفواتير لتُسلَّك تحت مسار B2B الصحيح. هل تريد
            المتابعة؟
          </>
        }
        confirmLabel="تأكيد"
        pending={creditMut.isPending}
        onConfirm={() => {
          if (!confirmRow) return;
          const total = Number(confirmRow.total) || 0;
          const paid = Number(confirmRow.paidAmount) || 0;
          const openAmt = Math.max(0, total - paid);
          if (openAmt <= 0) {
            toast({ title: "لا يوجد رصيد مفتوح لإصدار إشعار دائن", variant: "destructive" });
            return;
          }
          creditMut.mutate({ invoiceId: confirmRow.id, amount: openAmt, reason: CREDIT_REASON });
        }}
      />
    </PageShell>
  );
}
