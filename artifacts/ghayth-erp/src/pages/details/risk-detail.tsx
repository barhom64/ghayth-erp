import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, AlertTriangle } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  open: "مفتوح",
  mitigated: "مخفف",
  accepted: "مقبول",
  closed: "مغلق",
  monitoring: "قيد المراقبة",
};

const SEVERITY_LABELS: Record<string, string> = {
  low: "منخفض",
  medium: "متوسط",
  high: "عالي",
  critical: "حرج",
};

const LIKELIHOOD_LABELS: Record<string, string> = {
  rare: "نادر",
  unlikely: "غير محتمل",
  possible: "محتمل",
  likely: "مرجح",
  certain: "مؤكد",
};

const LIKELIHOOD_ORDER = ["rare", "unlikely", "possible", "likely", "certain"];
const IMPACT_ORDER = ["low", "medium", "high", "critical"];
const LIKELIHOOD_SCORE: Record<string, number> = {
  rare: 1,
  unlikely: 2,
  possible: 3,
  likely: 4,
  certain: 5,
};
const IMPACT_SCORE: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "closed" || status === "mitigated") return "success" as const;
  if (status === "open") return "destructive" as const;
  if (status === "monitoring") return "info" as const;
  if (status === "accepted") return "warning" as const;
  return "default" as const;
}

function severityTone(sev?: string | null) {
  if (!sev) return "default" as const;
  if (sev === "critical" || sev === "high") return "destructive" as const;
  if (sev === "medium") return "warning" as const;
  if (sev === "low") return "success" as const;
  return "default" as const;
}

function severityCellColor(score: number): string {
  // 1-4 -> green/yellow, 5-10 -> orange, 12+ -> red
  if (score >= 12) return "bg-status-error-surface0 text-white";
  if (score >= 8) return "bg-orange-500 text-white";
  if (score >= 4) return "bg-yellow-400 text-gray-900";
  return "bg-status-success-surface0 text-white";
}

export default function RiskDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/governance/risks/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("risk", id ?? 0);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["risk", String(id)],
    id ? `/governance/risks/${id}` : null,
    !!id
  );

  const risk = data;

  const likelihoodScore = risk?.likelihood ? LIKELIHOOD_SCORE[risk.likelihood] || 0 : 0;
  const impactScore = risk?.impact ? IMPACT_SCORE[risk.impact] || 0 : 0;
  const riskScore = likelihoodScore * impactScore;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!risk) return out;
    if (risk.departmentId) {
      out.push({
        type: "department",
        id: risk.departmentId,
        label: risk.departmentName || `قسم #${risk.departmentId}`,
        sublabel: "القسم",
      });
    }
    if (risk.ownerId) {
      out.push({
        type: "employee",
        id: risk.ownerId,
        label: risk.ownerName || `موظف #${risk.ownerId}`,
        sublabel: "المسؤول",
        href: `/hr/employees/${risk.ownerId}`,
      });
    }
    return out;
  }, [risk]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!risk) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم المرجع", value: `RISK-${id}` },
          { label: "العنوان", value: risk.title || "-" },
          { label: "التصنيف", value: risk.category || "-" },
          { label: "المسؤول", value: risk.owner || risk.ownerName || "-" },
          { label: "الاحتمالية", value: LIKELIHOOD_LABELS[risk.likelihood] || risk.likelihood || "-" },
          { label: "الأثر", value: SEVERITY_LABELS[risk.impact] || risk.impact || "-" },
          { label: "درجة المخاطرة", value: String(riskScore || "-") },
          { label: "تاريخ المراجعة", value: formatDateAr(risk.reviewDate) },
          { label: "القسم", value: risk.department || risk.departmentName || "-" },
          { label: "الحالة", value: STATUS_LABELS[risk.status] || risk.status || "-" },
        ],
      },
    ];
    if (risk.description) {
      sections.push({ kind: "text", title: "وصف المخاطرة", body: risk.description });
    }
    if (risk.mitigationPlan) {
      sections.push({ kind: "text", title: "خطة التخفيف", body: risk.mitigationPlan });
    }
    if (risk.residualRisk) {
      sections.push({ kind: "text", title: "المخاطر المتبقية", body: risk.residualRisk });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "المسؤول", name: risk.owner || risk.ownerName || "" },
        { label: "المعتمد", name: risk.approvedByName || "" },
      ],
    });
    return sections;
  }, [risk, id, riskScore]);

  const handleEdit = () => {
    setLocation(`/governance/risks/${id}/edit`);
  };

  // Risk matrix — rows: impact (critical -> low top to bottom), cols: likelihood (rare -> certain left to right).
  // Highlight the current risk cell.
  const matrix = (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">مصفوفة المخاطر (الاحتمالية × الأثر)</div>
      <div className="overflow-x-auto">
        <table className="text-[10px] border-collapse">
          <thead>
            <tr>
              <th className="p-1"></th>
              {LIKELIHOOD_ORDER.map((lk) => (
                <th key={lk} className="p-1 text-muted-foreground font-normal">
                  {LIKELIHOOD_LABELS[lk]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...IMPACT_ORDER].reverse().map((imp) => (
              <tr key={imp}>
                <th className="p-1 text-muted-foreground font-normal text-right pe-2">
                  {SEVERITY_LABELS[imp]}
                </th>
                {LIKELIHOOD_ORDER.map((lk) => {
                  const cellScore = LIKELIHOOD_SCORE[lk] * IMPACT_SCORE[imp];
                  const isCurrent = risk?.likelihood === lk && risk?.impact === imp;
                  return (
                    <td
                      key={lk}
                      className={`p-2 text-center border border-white ${severityCellColor(cellScore)} ${
                        isCurrent ? "ring-2 ring-offset-1 ring-blue-600 font-bold" : "opacity-70"
                      }`}
                    >
                      {cellScore}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            بيانات المخاطرة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {risk?.category && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">التصنيف</p>
                <Badge variant="outline">{risk.category}</Badge>
              </div>
            )}
            {risk?.likelihood && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الاحتمالية</p>
                <Badge variant="secondary">
                  {LIKELIHOOD_LABELS[risk.likelihood] || risk.likelihood}
                </Badge>
              </div>
            )}
            {risk?.impact && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الأثر</p>
                <Badge variant={severityTone(risk.impact) === "destructive" ? "destructive" : "outline"}>
                  {SEVERITY_LABELS[risk.impact] || risk.impact}
                </Badge>
              </div>
            )}
            {riskScore > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">درجة المخاطرة</p>
                <span
                  className={`inline-block px-2 py-0.5 rounded font-bold text-xs ${severityCellColor(
                    riskScore
                  )}`}
                >
                  {riskScore}
                </span>
              </div>
            )}
            {(risk?.owner || risk?.ownerName) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">المسؤول</p>
                <span className="text-status-neutral-foreground">{risk.owner || risk.ownerName}</span>
              </div>
            )}
            {(risk?.department || risk?.departmentName) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">القسم</p>
                <span className="text-status-neutral-foreground">{risk.department || risk.departmentName}</span>
              </div>
            )}
            {risk?.reviewDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ المراجعة</p>
                <span className="text-status-neutral-foreground">{formatDateAr(risk.reviewDate)}</span>
              </div>
            )}
          </div>

          {risk?.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">وصف المخاطرة</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{risk.description}</p>
            </div>
          )}

          {risk?.mitigationPlan && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">خطة التخفيف</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{risk.mitigationPlan}</p>
            </div>
          )}

          {risk?.residualRisk && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">المخاطر المتبقية</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{risk.residualRisk}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">مصفوفة المخاطر</CardTitle>
          </CardHeader>
          <CardContent>{matrix}</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">معلومات إضافية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {risk?.createdAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الإنشاء</p>
                <span className="text-status-neutral-foreground">{formatDateAr(risk.createdAt)}</span>
              </div>
            )}
            {risk?.createdByName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">أنشئ بواسطة</p>
                <span className="text-status-neutral-foreground">{risk.createdByName}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {id && <EntityComments entityType="risk" entityId={id} />}
      {id && <EntityTags entityType="risk" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={risk?.title || "تفاصيل المخاطرة"}
      subtitle={risk?.category}
      backPath="/governance/risks"
      refNumber={`RISK-${id}`}
      status={
        risk
          ? { label: STATUS_LABELS[risk.status] || risk.status || "-", tone: statusTone(risk.status) }
          : undefined
      }
      typeLabel={risk?.category}
      createdAt={risk?.createdAt}
      updatedAt={risk?.updatedAt}
      createdByName={risk?.createdByName}
      assignedToName={risk?.owner || risk?.ownerName}
      relatedEntities={relatedEntities}
      entityType="risk"
      entityId={id ?? 0}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {risk && (
            <EntityPrintButton
              branchId={risk.branchId}
              title={risk.title || "مخاطرة"}
              ref={`RISK-${id}`}
              date={formatDateAr(risk.createdAt)}
              sections={printSections}
            />
          )}
          <GuardedButton
            perm="governance:update"
            variant="outline"
            size="sm"
            onClick={handleEdit}
            disabled={!risk || ["closed"].includes(risk?.status)}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
