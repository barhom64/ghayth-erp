import { PageShell } from "@workspace/ui-core";
import { BiTabsNav } from "@/components/shared/bi-tabs-nav";
import { ReportsTab } from "./bi/reports-tab";

export default function BiReportsPage() {
  return (
    <PageShell title="التقارير" breadcrumbs={[{ href: "/bi", label: "التحليلات" }, { label: "التقارير" }]}>
      <BiTabsNav />
      <ReportsTab />
    </PageShell>
  );
}
