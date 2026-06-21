import { useLocation } from "wouter";
import { CreatePageLayout } from "@workspace/ui-core";
import { AccountCreateForm } from "@/pages/create/finance/account-create-form";

export default function AccountsCreate() {
  const [, setLocation] = useLocation();
  return (
    <CreatePageLayout title="إضافة حساب جديد" backPath="/finance/accounts">
      <AccountCreateForm
        onCreated={() => setLocation("/finance/accounts")}
        onCancel={() => setLocation("/finance/accounts")}
      />
    </CreatePageLayout>
  );
}
