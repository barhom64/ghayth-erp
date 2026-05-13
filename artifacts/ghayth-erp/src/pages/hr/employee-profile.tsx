import { useEffect } from "react";
import { useRoute, useLocation } from "wouter";

// Legacy route kept for backwards compatibility. The full hub page lives
// at /employees/:id (see employee-detail.tsx) — this component just
// redirects to the canonical location.
export default function EmployeeProfilePage() {
  const [, params] = useRoute("/hr/employee-profile/:id");
  const [, navigate] = useLocation();
  const id = params?.id;

  useEffect(() => {
    if (id) navigate(`/employees/${id}`, { replace: true });
  }, [id, navigate]);

  return <div className="text-center py-12 text-muted-foreground">جاري التحويل...</div>;
}
