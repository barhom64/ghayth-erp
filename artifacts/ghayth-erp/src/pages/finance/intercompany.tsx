import { useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@workspace/ui-core";
import { formatCurrency, formatDateAr as formatDate, todayLocal } from "@/lib/formatters";
import { ArrowLeftRight, Layers } from "lucide-react";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Link } from "wouter";
import { PageShell } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  FormShell, FormNumberField, FormTextareaField, FormDateField, FormSelectField, FormGrid,
} from "@workspace/ui-core";

// toCompanyId is a string in the form; the submit handler converts
// to number for the API. amount coerced via z.coerce.
const intercompanySchema = z.object({
  toCompanyId: z.string().min(1, "اختر الشركة"),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من 0"),
  description: z.string().trim(),
  transactionDate: z.string(),
});
type IntercompanyForm = z.infer<typeof intercompanySchema>;

export default function IntercompanyPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, isError } = useApiQuery<any>(
    ["intercompany"],
    `/finance/intercompany${scopeSuffix}`
  );

  const { data: companiesData } = useApiQuery<any>(
    ["companies-list"],
    `/settings/companies${scopeSuffix}`
  );

  const createMutation = useApiMutation<any, any>(
    "/finance/intercompany",
    "POST",
    [["intercompany"]],
    {
      successMessage: "تم تسجيل المعاملة البينية وإنشاء القيدين المحاسبيين",
    },
  );

  const companies = companiesData?.data ?? companiesData ?? [];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const handleSubmit = async (values: IntercompanyForm) => {
    await createMutation.mutateAsync({
      ...values,
      toCompanyId: Number(values.toCompanyId),
    });
    setShowCreate(false);
  };

  const list = data?.data ?? data ?? [];

  const columns: DataTableColumn<any>[] = [
    {
      key: "ref",
      header: "المرجع",
      sortable: true,
      render: (row) => <span className="font-mono text-status-info-foreground text-xs">{row.ref}</span>,
    },
    {
      key: "transactionDate",
      header: "التاريخ",
      sortable: true,
      render: (row) => <span className="text-muted-foreground text-xs">{row.transactionDate ? formatDate(row.transactionDate) : "-"}</span>,
    },
    { key: "fromCompanyName", header: "الشركة المُرسِلة", sortable: true },
    { key: "toCompanyName", header: "الشركة المُستقبِلة", sortable: true },
    {
      key: "amount",
      header: "المبلغ",
      sortable: true,
      render: (row) => <span className="font-semibold">{formatCurrency(row.amount)}</span>,
    },
    { key: "description", header: "البيان" },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (row) => (
        <PageStatusBadge status={row.status} domain="journal" />
      ),
    },
    {
      key: "fromJournalId",
      header: "قيد الإرسال",
      render: (row) => row.fromJournalId ? <span className="text-xs font-mono bg-surface-subtle px-2 py-0.5 rounded">#{row.fromJournalId}</span> : "—",
    },
    {
      key: "toJournalId",
      header: "قيد الاستلام",
      render: (row) => row.toJournalId ? <span className="text-xs font-mono bg-surface-subtle px-2 py-0.5 rounded">#{row.toJournalId}</span> : "—",
    },
  ];

  return (
    <PageShell
      title="المعاملات البينية"
      subtitle="تسجيل المعاملات المالية بين الشركات مع إنشاء قيود مزدوجة تلقائياً"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "المعاملات البينية" }]}
      loading={isLoading}
      actions={
        <>
          <Link href="/finance/intercompany/consolidation/create">
            <GuardedButton perm="finance:create" variant="outline">
              <Layers className="h-4 w-4 ml-2" />
              القوائم الموحدة
            </GuardedButton>
          </Link>
          <GuardedButton perm="finance:create" onClick={() => setShowCreate(true)}>
            <ArrowLeftRight className="h-4 w-4 ml-2" />
            معاملة جديدة
          </GuardedButton>
        </>
      }
    >
      <div className="rounded-xl border border-status-info-surface bg-status-info-surface p-4 text-sm text-status-info-foreground">
        <div className="font-semibold mb-1">آلية العمل التلقائية</div>
        عند تسجيل معاملة بينية، يُنشئ النظام تلقائياً:
        <ul className="mt-1 list-disc list-inside space-y-0.5 text-status-info-foreground">
          <li>قيد في الشركة المُرسِلة: <strong>ذمم مدينة شركة شقيقة (مدين) / إيراد شركة شقيقة (دائن)</strong></li>
          <li>قيد في الشركة المُستقبِلة: <strong>مصروف شركة شقيقة (مدين) / ذمم دائنة شركة شقيقة (دائن)</strong></li>
        </ul>
      </div>

      <DataTable
        columns={columns}
        data={list}
        isLoading={isLoading}
        emptyMessage="لا توجد معاملات بينية"
        emptyIcon={<ArrowLeftRight className="h-6 w-6 text-slate-400" />}
        noToolbar
      />

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b">
              <h3 className="text-lg font-bold">تسجيل معاملة بينية جديدة</h3>
            </div>
            <div className="p-6">
              <FormShell
                schema={intercompanySchema}
                defaultValues={{
                  toCompanyId: "",
                  amount: 0,
                  description: "",
                  transactionDate: todayLocal(),
                }}
                submitLabel="تسجيل المعاملة"
                secondaryActions={
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                    إلغاء
                  </Button>
                }
                onSubmit={async (values, ctx) => {
                  await handleSubmit(values);
                  ctx.reset();
                }}
              >
                <FormGrid cols={1}>
                  <FormSelectField
                    name="toCompanyId"
                    label="الشركة المُستقبِلة"
                    required
                    options={[
                      { value: "", label: "-- اختر الشركة --" },
                      ...(Array.isArray(companies) ? companies : []).map((c: any) => ({
                        value: String(c.id),
                        label: c.name,
                      })),
                    ]}
                  />
                  <FormNumberField name="amount" label="المبلغ" required placeholder="0.00" />
                  <FormDateField name="transactionDate" label="تاريخ المعاملة" />
                  <FormTextareaField name="description" label="البيان" rows={2} />
                </FormGrid>
              </FormShell>
            </div>
          </div>
        </div>
      )}

    </PageShell>
  );
}
