import { useLocation } from "wouter";
import { CreatePageLayout } from "@workspace/ui-core";
import { ClientCreateForm } from "@/pages/create/client-create-form";

export default function ClientsCreate() {
  const [, setLocation] = useLocation();
  return (
    <CreatePageLayout title="إضافة عميل جديد" backPath="/clients">
      <ClientCreateForm
        // Land on the new client's record so it's immediately visible — removes
        // the "I added a client and can't find it" ambiguity.
        onCreated={(c) => setLocation(c?.id ? `/clients/${c.id}` : "/clients")}
        onCancel={() => setLocation("/clients")}
      />
    </CreatePageLayout>
  );
}
