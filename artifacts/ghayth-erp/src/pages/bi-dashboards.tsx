import { PageShell } from "@workspace/ui-core";
import { BiTabsNav } from "@/components/shared/bi-tabs-nav";
import { DashboardsTab } from "./bi/dashboards-tab";

export default function BiDashboardsPage() {
  return (
    <PageShell title="لوحات المعلومات" breadcrumbs={[{ href: "/bi", label: "التحليلات" }, { label: "اللوحات" }]}>
      <BiTabsNav />
      <DashboardsTab />
    </PageShell>
  );
}
