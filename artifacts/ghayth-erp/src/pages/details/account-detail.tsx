import { useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import { DetailPageLayout } from "@/components/shared/detail-page-layout";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

export default function AccountDetail() {
  const [, params] = useRoute("/finance/accounts/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("account", id ?? 0);

  // Accounts have no GET /:id endpoint — fetch the list and find by id.
  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["accounts"],
    "/finance/accounts",
    !!id
  );
  const list = (data?.data ?? data) as any[] | undefined;
  const account = Array.isArray(list) ? list.find((a: any) => String(a.id) === String(id)) : null;

  const editDelete = useDetailEditDelete({
    entityLabel: "الحساب",
    patchPath: `/finance/accounts/${id}`,
    deletePath: `/finance/accounts/${id}`,
    listPath: "/finance/accounts",
    initialValues: account,
    fields: [
      { key: "name", label: "اسم الحساب" },
      { key: "code", label: "رمز الحساب" },
      { key: "type", label: "النوع" },
      { key: "description", label: "الوصف" },
    ],
    invalidateKeys: [["account", String(id)], ["accounts"]],
    onSaved: () => refetch(),
  });

  const overview = (
    <div className="space-y-4">
      <InlineEditCard hook={editDelete} />
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            بيانات الحساب
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-muted-foreground">الاسم:</span> {account?.name || "—"}</div>
            <div><span className="text-muted-foreground">الرمز:</span> {account?.code || "—"}</div>
            <div><span className="text-muted-foreground">النوع:</span> {account?.type || "—"}</div>
            <div><span className="text-muted-foreground">الرصيد:</span> {account?.balance ?? "—"}</div>
          </div>
          {account?.description && <div className="pt-2 border-t"><span className="text-muted-foreground">الوصف:</span> {account.description}</div>}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <DetailPageLayout
      title={account?.name || "الحساب"}
      backPath="/finance/accounts"
      backLabel="العودة"
      entityType="account"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      actions={<DetailActionButtons hook={editDelete} editPerm="finance:update" deletePerm="finance:delete" />}
    />
  );
}
