/**
 * /hr/discipline/memos — تحويل لصفحة الانضباط الأم.
 *
 * تم توحيد عرض المحاضر داخل /hr/violations كتبويب "المحاضر".
 * هذه الصفحة تبقى للتوافق مع الروابط القديمة فقط، وتحوّل المستخدم تلقائيًا.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/shared/loading-error-states";

export default function DisciplineMemosPage() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/hr/violations?tab=memos", { replace: true });
  }, [navigate]);

  return (
    <PageShell title="جارٍ التحويل..." breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}>
      <Card><CardContent className="py-12"><LoadingSpinner /></CardContent></Card>
    </PageShell>
  );
}
