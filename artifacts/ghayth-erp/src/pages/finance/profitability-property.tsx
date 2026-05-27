// Thin polymorphic wrapper — delegates to the shared ProfitabilityPage
// with entityType="property". F7 audit-doc note.
import ProfitabilityPage from "./profitability";
export default function ProfitabilityProperty() {
  return <ProfitabilityPage entityType="property" />;
}
