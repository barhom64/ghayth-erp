import { useLocation } from "wouter";
import { CreatePageLayout } from "@workspace/ui-core";
import { DriverCreateForm } from "@/pages/create/fleet/driver-create-form";

export default function DriversCreate() {
  const [, setLocation] = useLocation();
  return (
    <CreatePageLayout title="إضافة سائق جديد" backPath="/fleet/drivers">
      <DriverCreateForm
        onCreated={() => setLocation("/fleet/drivers")}
        onCancel={() => setLocation("/fleet/drivers")}
      />
    </CreatePageLayout>
  );
}
