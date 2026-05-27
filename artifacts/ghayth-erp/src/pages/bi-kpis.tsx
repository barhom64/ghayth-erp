import { PageShell } from "@workspace/ui-core";
import { BiTabsNav } from "@/components/shared/bi-tabs-nav";
import { KPIsTab } from "./bi/kpis-tab";

export default function BiKpisPage() {
  return (
    <PageShell title="المؤشرات" breadcrumbs={[{ href: "/bi", label: "التحليلات" }, { label: "المؤشرات" }]}>
      <BiTabsNav />
      <KPIsTab />
    </PageShell>
  );
}
