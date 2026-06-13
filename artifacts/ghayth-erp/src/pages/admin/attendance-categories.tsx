// PR-3 (#2163) — canonical ownership: /hr/attendance-categories هو المالك.
// هذا الـ route الإداري back-compat redirect — لا منطق عمل هنا.
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function AttendanceCategoriesAdminRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/hr/attendance-categories");
  }, [setLocation]);
  return null;
}
