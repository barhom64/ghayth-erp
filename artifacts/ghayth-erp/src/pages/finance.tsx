import { useEffect } from "react";
import { useLocation } from "wouter";
import { PageShell } from "@workspace/ui-core";

export default function Finance() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/finance/accounts");
  }, [setLocation]);
  return (
    <PageShell title="المالية" breadcrumbs={[{ label: "المالية" }]}>
      <div />
    </PageShell>
  );
}
