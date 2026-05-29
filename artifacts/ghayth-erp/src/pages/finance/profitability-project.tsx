// Thin polymorphic wrapper — delegates to the shared ProfitabilityPage
// with entityType="project". F7 audit-doc note.
import ProfitabilityPage from "./profitability";
export default function ProfitabilityProject() {
  return <ProfitabilityPage entityType="project" />;
}
