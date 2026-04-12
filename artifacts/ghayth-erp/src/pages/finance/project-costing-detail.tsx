import { useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EntityDetailPage, type EntityTab } from "@/components/shared/entity-detail-page";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { EntityTimeline } from "@/components/shared/entity-timeline";
import { EntityComments } from "@/components/shared/entity-comments";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import {
  FolderOpen,
  Activity,
  History,
  MessageCircle,
  FolderKanban,
  DollarSign,
  TrendingUp,
  Wallet,
  Percent,
  Hash,
  Calendar,
} from "lucide-react";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "success" | "warning" | "destructive" | "info" }> = {
  active: { label: "نشط", variant: "success" },
  completed: { label: "مكتمل", variant: "info" },
  cancelled: { label: "ملغي", variant: "destructive" },
  on_hold: { label: "موقوف", variant: "warning" },
};

export default function ProjectCostingDetailPage() {
  const [, params] = useRoute("/finance/project-costing/:id");
  const id = params?.id || "";

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

  const statusCfg = STATUS_MAP[project?.status] ?? { label: project?.status ?? "—", variant: "default" as const };

  const overviewContent = () => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoRow label="المرجع" value={project?.ref} />
          <InfoRow label="اسم المشروع" value={project?.name} />
          <InfoRow label="الوصف" value={project?.description} />
          <InfoRow label="الحالة" value={statusCfg.label} />
          <InfoRow label="تاريخ البدء" value={project?.startDate ? formatDateAr(project.startDate) : undefined} />
          <InfoRow label="تاريخ الانتهاء" value={project?.endDate ? formatDateAr(project.endDate) : undefined} />
        </div>

        <div className="pt-4 border-t">
          <p className="text-sm font-semibold mb-2">القيود المحاسبية المرتبطة بالمشروع</p>
          <div className="rounded-xl border overflow-hidden text-sm">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-right text-xs text-gray-500">المرجع</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500">البيان</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500">التاريخ</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {loadingCosts ? (
                  <tr><td colSpan={4} className="text-center py-6 text-gray-400">جاري التحميل...</td></tr>
                ) : costDetails.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-6 text-gray-400">لا توجد تكاليف مسجلة لهذا المشروع بعد</td></tr>
                ) : costDetails.map((c: any) => (
                  <tr key={c.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{c.ref}</td>
                    <td className="px-3 py-2">{c.description}</td>
                    <td className="px-3 py-2 text-gray-500">{c.date ? formatDateAr(c.date) : "—"}</td>
                    <td className="px-3 py-2 font-semibold">{formatCurrency(Number(c.amount) || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const tabs: EntityTab[] = [
    { key: "overview", label: "نظرة عامة", icon: Activity, content: overviewContent },
    {
      key: "documents",
      label: "المستندات",
      icon: FolderOpen,
      content: () => <EntityDocuments entityType="project-finance" entityId={id} />,
    },
    {
      key: "timeline",
      label: "السجل الزمني",
      icon: History,
      content: () => <EntityTimeline entityType="project-finance" entityId={id} />,
    },
    {
      key: "comments",
      label: "التعليقات",
      icon: MessageCircle,
      content: () => <EntityComments entityType="project-finance" entityId={id} />,
    },
  ];

  const metaItems = [
    project?.ref && { icon: Hash, label: project.ref },
    project?.startDate && { icon: Calendar, label: `يبدأ: ${formatDateAr(project.startDate)}` },
    project?.endDate && { icon: Calendar, label: `ينتهي: ${formatDateAr(project.endDate)}` },
  ].filter(Boolean) as Array<{ icon: any; label: string }>;

  const badges = <Badge variant="outline">{statusCfg.label}</Badge>;

  const notFound = !isLoading && !project;

  return (
    <EntityDetailPage
      title={project?.name || (notFound ? "المشروع غير موجود" : "...")}
      subtitle={project?.description || undefined}
      avatar={{
        icon: FolderKanban,
        gradientFrom: "from-emerald-500",
        gradientTo: "to-teal-600",
      }}
      status={{ label: statusCfg.label, variant: statusCfg.variant }}
      badges={badges}
      metaItems={metaItems}
      backHref="/finance/project-costing"
      backLabel="العودة لتكاليف المشاريع"
      isLoading={isLoading}
      isError={isError || notFound}
      errorMessage={notFound ? "لم يتم العثور على المشروع المطلوب" : "تعذر تحميل بيانات المشروع"}
      onRetry={() => refetch()}
      kpis={[
        {
          label: "الميزانية",
          value: formatCurrency(budget),
          icon: DollarSign,
          color: "text-blue-600 bg-blue-50",
        },
        {
          label: "التكلفة الفعلية",
          value: formatCurrency(actualCost),
          icon: TrendingUp,
          color: "text-gray-700 bg-gray-100",
        },
        {
          label: "المتبقي",
          value: formatCurrency(budgetRemaining),
          icon: Wallet,
          color: budgetRemaining >= 0 ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50",
        },
        {
          label: "نسبة الاستخدام",
          value: `${usagePct}%`,
          icon: Percent,
          color: "text-purple-600 bg-purple-50",
        },
      ]}
      tabs={tabs}
      defaultTab="overview"
    />
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800 mt-0.5">{value || "—"}</p>
    </div>
  );
}
