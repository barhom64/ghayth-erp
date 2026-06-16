import { useLocation } from "wouter";
import { CreatePageLayout } from "@workspace/ui-core";
import { ProductCreateForm } from "@/components/shared/product-create-form";

export default function WarehouseCreate() {
  const [, setLocation] = useLocation();
  return (
    <CreatePageLayout title="إضافة منتج جديد" backPath="/warehouse">
      <ProductCreateForm
        onCreated={() => setLocation("/warehouse")}
        onCancel={() => setLocation("/warehouse")}
      />
    </CreatePageLayout>
  );
}
