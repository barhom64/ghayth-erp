import { useMemo } from "react";
import { DollarSign } from "lucide-react";
import { getEntityFeatures } from "@/lib/entity-features";
import { EntityFinancialProfile } from "@/components/shared/entity-financial-profile";
import type { ExtraTab } from "@/components/shared/detail-page-layout";

interface RegistryTabsResult {
  extraTabs: ExtraTab[];
  hideTabs: ("documents" | "timeline" | "comments" | "tasks")[];
}

export function useRegistryTabs(
  entityType: string,
  entityId: number | string,
): RegistryTabsResult {
  return useMemo(() => {
    const features = getEntityFeatures(entityType);
    const hideTabs: RegistryTabsResult["hideTabs"] = [];
    const extraTabs: ExtraTab[] = [];

    if (!features.attachments) hideTabs.push("documents");
    if (!features.timeline) hideTabs.push("timeline");
    if (!features.comments) hideTabs.push("comments");
    if (!features.tasks) hideTabs.push("tasks");

    if (features.financialImpact && features.financialEntityType) {
      extraTabs.push({
        key: "financial",
        label: "الملف المالي",
        icon: DollarSign,
        content: () => (
          <EntityFinancialProfile
            entityType={features.financialEntityType as any}
            entityId={entityId}
          />
        ),
      });
    }

    return { extraTabs, hideTabs };
  }, [entityType, entityId]);
}
