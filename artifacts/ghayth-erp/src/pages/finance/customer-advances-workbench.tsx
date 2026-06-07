import { useEffect } from "react";
import { useLocation } from "wouter";

export default function CustomerAdvancesWorkbenchRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/finance/customer-advances?view=grouped");
  }, [setLocation]);
  return null;
}
