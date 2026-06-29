import { useLocation } from "wouter";
import { CreatePageLayout } from "@workspace/ui-core";
import { UnitForm } from "@/pages/create/properties/unit-form";

export default function PropertiesCreate() {
  const [, setLocation] = useLocation();
  return (
    <CreatePageLayout title="إضافة وحدة عقارية" backPath="/properties">
      <UnitForm
        onCreated={() => setLocation("/properties")}
        onCancel={() => setLocation("/properties")}
      />
    </CreatePageLayout>
  );
}
