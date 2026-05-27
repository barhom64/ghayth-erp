// Thin polymorphic wrapper — delegates to the shared AccountStatementPage
// with entityType="vendor". The shared component reads from
// /finance/reports/vendor-statement/:id. F7 audit-doc note: this file
// intentionally has no direct backend call; the work happens in the
// shared parent.
import AccountStatementPage from "./account-statement";

export default function VendorStatement() {
  return <AccountStatementPage entityType="vendor" />;
}
