import { useLocation } from "wouter";
import { CreatePageLayout } from "@workspace/ui-core";
import { VehicleCreateForm } from "@/pages/create/fleet/vehicle-create-form";

export default function VehiclesCreate() {
  const [, setLocation] = useLocation();
  return (
    <CreatePageLayout title="إضافة مركبة جديدة" backPath="/fleet">
      <VehicleCreateForm
        onCreated={() => setLocation("/fleet")}
        onCancel={() => setLocation("/fleet")}
      />
    </CreatePageLayout>
  );
}
