// Thin polymorphic wrapper — delegates to the shared AccountStatementPage
// with entityType="customer". The shared component reads from
// /finance/reports/customer-statement/:id. F7 audit-doc note: this file
// intentionally has no direct backend call; the work happens in the
// shared parent.
import AccountStatementPage from "./account-statement";

export default function CustomerStatement() {
  return <AccountStatementPage entityType="customer" />;
}
