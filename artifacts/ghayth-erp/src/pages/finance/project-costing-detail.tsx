import { useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import {
  resolveStatus,
  type StatusTone,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { DetailPageLayout } from "@workspace/entity-kit";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import {
  DollarSign,
  TrendingUp,
  Wallet,
  Percent,
} from "lucide-react";

const TONE_MAP: Record<StatusTone, "success" | "warning" | "info" | "muted" | "destructive" | "default"> = {
  success: "success",
  info: "info",
  progress: "info",
  warning: "warning",
  danger: "destructive",
  muted: "muted",
  neutral: "default",
};

export default function ProjectCostingDetailPage() {
  const [, params] = useRoute("/finance/project-costing/:id");
  const id = params?.id || "";
  const { extraTabs, hideTabs } = useRegistryTabs("project-costing", id ?? "");

  const { data: project, isLoading, isError, refetch } = useApiQuery<any>(
    ["project-finance-detail", id],
    id ? `/finance/projects/${id}` : null,
    !!id
  );

  const { data: costsData, isLoading: loadingCosts } = useApiQuery<any>(
    ["project-costs", id],
    id ? `/finance/projects/${id}/costs` : null,
    !!id
  );

  const costDetails: any[] = costsData?.costs ?? [];
  const costSummary: any = costsData?.summary ?? {};

  const budget = Number(costSummary.budget ?? project?.budget ?? 0);
  const actualCost = Number(costSummary.totalCost ?? project?.actualCost ?? 0);
  const budgetRemaining = Number(costSummary.budgetRemaining ?? project?.budgetRemaining ?? (budget - actualCost));
  const usagePct = costSummary.usagePct ?? (budget > 0 ? Math.round((actualCost / budget) * 100) : 0);

  const resolvedStatus = project?.status ? resolveStatus(project.status, "project") : null;
  const statusLabel = resolvedStatus?.label ?? project?.status ?? "—";
  const statusTone = resolvedStatus ? TONE_MAP[resolvedStatus.tone] : ("default" as const);

  const overview = (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard icon={DollarSign} label="الميزانية" value={formatCurrency(budget)} color="text-status-info-foreground bg-status-info-surface" />
        <KpiCard icon={TrendingUp} label="التكلفة الفعلية" value={formatCurrency(actualCost)} color="text-status-neutral-foreground bg-surface-subtle" />
        <KpiCard icon={Wallet} label="المتبقي" value={formatCurrency(budgetRemaining)} color={budgetRemaining >= 0 ? "text-status-success-foreground bg-status-success-surface" : "text-status-error-foreground bg-status-error-surface"} />
        <KpiCard icon={Percent} label="نسبة الاستخدام" value={`${usagePct}%`} color="text-purple-600 bg-purple-50" />
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label="المرجع" value={project?.ref} />
            <InfoRow label="اسم المشروع" value={project?.name} />
            <InfoRow label="الوصف" value={project?.description} />
            <InfoRow label="الحالة" value={statusLabel} />
            <InfoRow label="تاريخ البدء" value={project?.startDate ? formatDateAr(project.startDate) : undefined} />
            <InfoRow label="تاريخ الانتهاء" value={project?.endDate ? formatDateAr(project.endDate) : undefined} />
          </div>

          <div className="pt-4 border-t">
            <p className="text-sm font-semibold mb-2">القيود المحاسبية المرتبطة بالمشروع</p>
            <div className="rounded-xl border overflow-hidden text-sm">
              <DataTable
                columns={[
                  { key: "ref", header: "المرجع", render: (r) => <span className="font-mono text-xs">{r.ref}</span> },
                  { key: "description", header: "البيان" },
                  { key: "date", header: "التاريخ", render: (r) => <span className="text-muted-foreground">{r.date ? formatDateAr(r.date) : "—"}</span> },
                  { key: "amount", header: "المبلغ", sortable: true, render: (r) => <span className="font-semibold">{formatCurrency(Number(r.amount) || 0)}</span> },
                ] satisfies DataTableColumn<any>[]}
                data={costDetails}
                isLoading={loadingCosts}
                pageSize={0}
                noToolbar
                searchPlaceholder={null}
                emptyMessage="لا توجد تكاليف مسجلة لهذا المشروع بعد"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );

  return (
    <DetailPageLayout
      title={project?.name || "المشروع"}
      subtitle={project?.description || undefined}
      backPath="/finance/project-costing"
      backLabel="العودة لتكاليف المشاريع"
      status={{ label: statusLabel, tone: statusTone }}
      refNumber={project?.ref}
      createdAt={project?.startDate || project?.createdAt}
      updatedAt={project?.updatedAt}
      entityType="project-costing"
      entityId={id}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      isLoading={isLoading}
      error={isError ? true : undefined}
      onRetry={() => refetch()}
      overview={overview}
    />
  );
}

function KpiCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  const [textColor, bgColor] = color.split(" ");
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${bgColor}`}>
          <Icon className={`h-5 w-5 ${textColor}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-status-neutral-foreground mt-0.5">{value || "—"}</p>
    </div>
  );
}
