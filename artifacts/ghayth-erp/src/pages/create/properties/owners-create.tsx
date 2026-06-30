import { useLocation } from "wouter";
import { CreatePageLayout } from "@workspace/ui-core";
import { OwnerForm } from "@/pages/create/properties/owner-form";

export default function OwnersCreate() {
  const [, setLocation] = useLocation();
  return (
    <CreatePageLayout
      title="إضافة مالك جديد"
      subtitle="تسجيل مالك عقار في النظام"
      backPath="/properties/owners"
    >
      <OwnerForm
        onCreated={() => setLocation("/properties/owners")}
        onCancel={() => setLocation("/properties/owners")}
      />
    </CreatePageLayout>
  );
}
