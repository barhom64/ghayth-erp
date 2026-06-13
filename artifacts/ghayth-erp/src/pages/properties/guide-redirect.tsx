// PR-3 (#2163) — /guide/properties back-compat redirect.
// canonical هو /properties/guide (مسار العقارات مالك الدليل).
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function PropertiesGuideRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/properties/guide");
  }, [setLocation]);
  return null;
}
