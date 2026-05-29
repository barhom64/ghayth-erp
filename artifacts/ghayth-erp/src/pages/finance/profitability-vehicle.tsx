// Thin polymorphic wrapper — delegates to the shared ProfitabilityPage
// with entityType="vehicle". Shared parent fetches from
// /finance/profitability?entityType=vehicle. F7 audit-doc note.
import ProfitabilityPage from "./profitability";
export default function ProfitabilityVehicle() {
  return <ProfitabilityPage entityType="vehicle" />;
}
