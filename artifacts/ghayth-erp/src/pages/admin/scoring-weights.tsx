// PR-3 (#2163) — canonical ownership: /hr/scoring-weights هو المالك.
// هذا الـ route الإداري back-compat redirect — لا منطق عمل هنا.
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ScoringWeightsAdminRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/hr/scoring-weights");
  }, [setLocation]);
  return null;
}
