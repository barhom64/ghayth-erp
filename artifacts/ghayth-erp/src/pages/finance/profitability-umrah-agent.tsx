// Thin polymorphic wrapper — delegates to the shared ProfitabilityPage
// with entityType="umrah-agent". F7 audit-doc note.
import ProfitabilityPage from "./profitability";
export default function ProfitabilityUmrahAgent() {
  return <ProfitabilityPage entityType="umrah-agent" />;
}
