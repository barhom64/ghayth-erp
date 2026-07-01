import { useLocation } from "wouter";
import { CreatePageLayout } from "@workspace/ui-core";
import { BuildingForm } from "@/pages/create/properties/building-form";

export default function BuildingsCreate() {
  const [, setLocation] = useLocation();
  return (
    <CreatePageLayout
      title="إضافة مبنى جديد"
      subtitle="تسجيل مبنى أو مجمع في النظام"
      backPath="/properties/buildings"
    >
      <BuildingForm
        onCreated={() => setLocation("/properties/buildings")}
        onCancel={() => setLocation("/properties/buildings")}
      />
    </CreatePageLayout>
  );
}
