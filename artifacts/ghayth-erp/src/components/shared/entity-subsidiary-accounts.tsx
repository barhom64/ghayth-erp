import { useMemo, useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import {
  DataTable,
  type DataTableColumn,
  FormShell,
  FormSelectField,
} from "@workspace/ui-core";
import { GuardedButton } from "@/components/shared/permission-gate";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { PageStateWrapper } from "@/components/shared/page-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchableSelectField } from "@/components/shared/searchable-select";
import { useFormContext } from "react-hook-form";
import { Link2, Plus, Trash2, Pencil } from "lucide-react";

/**
 * EntitySubsidiaryAccounts — view + open/relink an entity's GL subsidiary
 * accounts FROM THE ENTITY'S OWN PAGE (vehicle / umrah agent / custody /
 * AR), realising the "نظام قوي قابل للتحكم لا ثابت" vision (#1594): each
 * entity auto-opens its own postable leaf accounts (fuel / maintenance /
 * depreciation / custody / revenue / receivable) under the right main
 * account, and the operator can re-point any of them to a different GL
 * account without leaving the entity page.
 *
 * Backend (no new endpoints — reuses accounting-engine.ts):
 *   GET    /finance/subsidiary-accounts/entity/:entityType/:entityId
 *   POST   /finance/subsidiary-accounts            (ON CONFLICT upsert = relink)
 *   DELETE /finance/subsidiary-accounts/:id
 *
 * Drop-in: <EntitySubsidiaryAccounts entityType="vehicle" entityId={id} />.
 */

export type SubsidiaryEntityType =
  | "employee"
  | "client"
  | "vendor"
  | "vehicle"
  | "driver"
  | "property"
  | "property_unit"
  | "umrah_agent"
  | "umrah_sub_agent"
  | "umrah_season";

// Account-type slots the engine auto-creates per entity (superset across all
// entity kinds). Used both for labels and for the link/relink picker.
const ACCOUNT_TYPES = [
  { value: "fuel", label: "وقود" },
  { value: "maintenance", label: "صيانة" },
  { value: "depreciation", label: "إهلاك" },
  { value: "custody", label: "عهدة" },
  { value: "advance", label: "سلفة" },
  { value: "receivable", label: "ذمم مدينة" },
  { value: "payable", label: "ذمم دائنة" },
  { value: "revenue", label: "إيراد" },
  { value: "other", label: "أخرى" },
];
const ACCOUNT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ACCOUNT_TYPES.map((t) => [t.value, t.label]),
);

interface SubsidiaryAccountRow {
  id: number;
  entityType: string;
  entityId: number;
  accountType: string;
  accountId: number;
  accountCode: string | null;
  accountName: string | null;
  currentBalance: number | string | null;
  allowPosting?: boolean;
  isActive: boolean;
}

const formSchema = z.object({
  accountType: z.string().trim().min(1, "نوع الحساب مطلوب"),
  accountId: z.coerce.number().int().positive("اختر الحساب من شجرة الحسابات"),
});
type FormValues = z.infer<typeof formSchema>;

export function EntitySubsidiaryAccounts({
  entityType,
  entityId,
}: {
  entityType: SubsidiaryEntityType;
  entityId: number | string;
}) {
  const idNum = Number(entityId);
  const queryKey: string[] = ["finance-subsidiary-accounts-entity", entityType, String(idNum)];
  const { data, isLoading, error, refetch } = useApiQuery<{ data: SubsidiaryAccountRow[] }>(
    queryKey,
    idNum ? `/finance/subsidiary-accounts/entity/${entityType}/${idNum}` : null,
    { enabled: !!idNum },
  );
  const rows: SubsidiaryAccountRow[] = data?.data ?? [];

  // `editing` carries the account-type to pre-select when relinking an
  // existing row; null = create-new (operator picks the type).
  const [editing, setEditing] = useState<SubsidiaryAccountRow | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<SubsidiaryAccountRow | null>(null);
  const dialogOpen = editing !== undefined;

  const columns: DataTableColumn<SubsidiaryAccountRow>[] = [
    {
      key: "accountType",
      header: "نوع الحساب",
      render: (r) => (
        <Badge variant="outline">{ACCOUNT_TYPE_LABEL[r.accountType] ?? r.accountType}</Badge>
      ),
    },
    {
      key: "account",
      header: "الحساب في دليل الحسابات",
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs text-muted-foreground" dir="ltr">
            {r.accountCode ?? `#${r.accountId}`}
          </span>
          <span className="text-sm">{r.accountName ?? "—"}</span>
        </div>
      ),
    },
    {
      key: "currentBalance",
      header: "الرصيد",
      ltr: true,
      render: (r) =>
        r.currentBalance != null
          ? Number(r.currentBalance).toLocaleString("ar-SA")
          : "—",
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) => (
        <Badge variant={r.isActive ? "default" : "secondary"}>
          {r.isActive ? "نشط" : "موقوف"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex gap-1 justify-end">
          <GuardedButton
            perm="finance.accounting_engine:create"
            size="sm"
            variant="ghost"
            title="تعديل/إعادة ربط الحساب"
            onClick={() => setEditing(r)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </GuardedButton>
          <GuardedButton
            perm="finance.accounting_engine:delete"
            size="sm"
            variant="ghost"
            className="text-status-error-foreground"
            title="حذف الربط"
            onClick={() => setDeleting(r)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </GuardedButton>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          حسابات هذا الكيان في دليل الحسابات — تُفتح تلقائياً عند إنشائه، ويمكن إعادة ربط أيٍّ منها بحساب آخر من هنا.
        </p>
        <GuardedButton
          perm="finance.accounting_engine:create"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => setEditing(null)}
        >
          <Plus className="h-4 w-4" /> ربط حساب
        </GuardedButton>
      </div>

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(r) => r.id}
          emptyMessage="لا توجد حسابات فرعية لهذا الكيان بعد — اضغط «ربط حساب» لفتح حساب قابل للترحيل، أو ستُنشأ تلقائياً عند أول عملية."
        />
      </PageStateWrapper>

      {dialogOpen && (
        <LinkAccountDialog
          entityType={entityType}
          entityId={idNum}
          presetAccountType={editing?.accountType ?? null}
          invalidateKey={queryKey}
          onOpenChange={(o) => {
            if (!o) setEditing(undefined);
          }}
          onSaved={() => {
            setEditing(undefined);
            refetch();
          }}
        />
      )}

      {deleting && (
        <ConfirmDeleteDialog
          open={deleting !== null}
          onOpenChange={(o) => {
            if (!o) setDeleting(null);
          }}
          entity={{
            type: "subsidiary_account",
            id: deleting.id,
            name: `${ACCOUNT_TYPE_LABEL[deleting.accountType] ?? deleting.accountType} → ${deleting.accountCode ?? "?"}`,
          }}
          deletePath={`/finance/subsidiary-accounts/${deleting.id}`}
          invalidateKeys={[queryKey]}
          onDeleted={() => {
            setDeleting(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function LinkAccountDialog({
  entityType,
  entityId,
  presetAccountType,
  invalidateKey,
  onOpenChange,
  onSaved,
}: {
  entityType: SubsidiaryEntityType;
  entityId: number;
  presetAccountType: string | null;
  invalidateKey: string[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  // ON CONFLICT (companyId, entityType, entityId, accountType) upsert — so a
  // POST with an existing type re-points it (= edit), and a new type creates.
  const saveMut = useApiMutation<
    SubsidiaryAccountRow,
    FormValues & { entityType: string; entityId: number }
  >(
    "/finance/subsidiary-accounts",
    "POST",
    [invalidateKey],
    { successMessage: "تم ربط الحساب" },
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            {presetAccountType ? "إعادة ربط الحساب" : "ربط حساب فرعي"}
          </DialogTitle>
        </DialogHeader>
        <FormShell
          schema={formSchema}
          defaultValues={{ accountType: presetAccountType ?? "fuel", accountId: 0 }}
          submitLabel="حفظ"
          secondaryActions={
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await saveMut.mutateAsync({ ...values, entityType, entityId });
            onSaved();
          }}
        >
          <FormSelectField
            name="accountType"
            label="نوع الحساب"
            required
            disabled={!!presetAccountType}
            options={ACCOUNT_TYPES}
          />
          <AccountIdPicker />
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

// Binds a chart-of-accounts id (int) into the form. Only postable leaves are
// offered — the subsidiary row must point at a leaf the engine can debit/credit.
function AccountIdPicker() {
  const { watch, setValue, formState } = useFormContext<FormValues>();
  const accountId = watch("accountId");
  const err = formState.errors.accountId?.message;
  const { data } = useApiQuery<{
    data: Array<{ id: number; code: string; name: string; allowPosting: boolean }>;
  }>(["finance-accounts", "all"], "/finance/accounts?limit=500");
  const options = useMemo(
    () =>
      (data?.data ?? [])
        .filter((a) => a.allowPosting !== false)
        .map((a) => ({ value: String(a.id), label: `${a.code} - ${a.name}` })),
    [data],
  );

  return (
    <div className="space-y-1.5">
      <SearchableSelectField
        label="الحساب من دليل الحسابات"
        required
        options={options}
        value={accountId ? String(accountId) : ""}
        onValueChange={(v) =>
          setValue("accountId", Number(v) || 0, { shouldDirty: true, shouldValidate: true })
        }
        placeholder="ابحث عن حساب..."
        searchPlaceholder="رقم الحساب أو الاسم..."
        emptyText="لا توجد حسابات قابلة للترحيل"
      />
      {err && <p className="text-xs text-status-error-foreground">{String(err)}</p>}
    </div>
  );
}
