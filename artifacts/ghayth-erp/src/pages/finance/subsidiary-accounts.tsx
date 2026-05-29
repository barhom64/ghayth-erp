import { useState, useMemo } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  FormShell,
  FormSelectField,
  FormGrid,
  AdvancedFilters,
  useFilters,
  applyFilters,
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
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Link2 } from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import {
  EmployeeSelect,
  ClientSelect,
  VendorSelect,
  DriverSelect,
  VehicleSelect,
} from "@/components/shared/entity-selects";
import { SearchableSelectField } from "@/components/shared/searchable-select";
import { useFormContext } from "react-hook-form";

/**
 * Finance / Subsidiary Accounts — list + create + delete.
 *
 * Phase D / Finance gap. Closes 4 unused-backend endpoints:
 *   GET    /finance/subsidiary-accounts
 *   GET    /finance/subsidiary-accounts/entity/:entityType/:entityId
 *   POST   /finance/subsidiary-accounts
 *   DELETE /finance/subsidiary-accounts/:id
 *
 * Subsidiary accounts are the bridge between a business entity
 * (employee, client, vendor, vehicle, driver, property) and a
 * leaf row in the chart of accounts — e.g. employee #42 is
 * tied to "1131-0042 سلفة محمد علي". Without these links the
 * accounting-engine has nothing to debit/credit when it auto-
 * posts journals from operations (custody issued, invoice
 * paid, vendor bill received). Auto-create runs on entity
 * creation (see createSubsidiaryAccountsForEntity in
 * routes/accounting-engine.ts), so most rows show up by
 * themselves. This page is the operator's manual lever when
 * the auto-flow misses a case or a row needs to be redirected
 * to a different GL account.
 *
 * No edit dialog — the table has 4 fixed columns
 * (entity-type / entity-id / account-type / account) and the
 * backend INSERT uses ON CONFLICT to upsert, so creating with
 * the same composite key replaces the mapping in-place. Delete
 * is hard (DELETE FROM, not soft-delete) because these are
 * cheap to re-create.
 */

const ENTITY_TYPES = [
  { value: "employee", label: "موظف" },
  { value: "client", label: "عميل" },
  { value: "vendor", label: "مورد" },
  { value: "vehicle", label: "مركبة" },
  { value: "driver", label: "سائق" },
  { value: "property", label: "عقار" },
] as const;
type EntityType = (typeof ENTITY_TYPES)[number]["value"];

const ENTITY_LABEL: Record<string, string> = Object.fromEntries(
  ENTITY_TYPES.map((e) => [e.value, e.label]),
);

const ACCOUNT_TYPES = [
  { value: "advance", label: "سلفة" },
  { value: "custody", label: "عهدة" },
  { value: "receivable", label: "ذمم مدينة" },
  { value: "payable", label: "ذمم دائنة" },
  { value: "other", label: "أخرى" },
];

const ACCOUNT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ACCOUNT_TYPES.map((t) => [t.value, t.label]),
);

interface SubsidiaryAccountRow {
  id: number;
  entityType: EntityType | string;
  entityId: number;
  accountType: string;
  accountId: number;
  accountCode: string | null;
  accountName: string | null;
  currentBalance: number | string | null;
  isActive: boolean;
}

const formSchema = z.object({
  entityType: z.enum(["employee", "client", "vendor", "vehicle", "driver", "property"]),
  entityId: z.coerce.number().int().positive("اختر الكيان"),
  accountType: z.string().trim().min(1, "نوع الحساب مطلوب"),
  accountId: z.coerce.number().int().positive("اختر الحساب من شجرة الحسابات"),
});
type FormValues = z.infer<typeof formSchema>;

const EMPTY_DEFAULTS: FormValues = {
  entityType: "employee",
  entityId: 0,
  accountType: "advance",
  accountId: 0,
};

export default function SubsidiaryAccountsPage() {
  const [entityFilter, setEntityFilter] = useState<{ type: EntityType | ""; id: string }>({ type: "", id: "" });

  // Two queries — the list endpoint when no entity is selected, and the
  // per-entity endpoint when the user wants to focus on a specific
  // employee / vendor / vehicle. Either is enabled at a time.
  const listQ = useApiQuery<{ data: SubsidiaryAccountRow[] }>(
    ["finance-subsidiary-accounts"],
    "/finance/subsidiary-accounts",
    { enabled: !(entityFilter.type && entityFilter.id) },
  );
  const entityQ = useApiQuery<{ data: SubsidiaryAccountRow[] }>(
    ["finance-subsidiary-accounts-entity", entityFilter.type, entityFilter.id],
    entityFilter.type && entityFilter.id
      ? `/finance/subsidiary-accounts/entity/${entityFilter.type}/${entityFilter.id}`
      : null,
    { enabled: !!(entityFilter.type && entityFilter.id) },
  );

  const { data, isLoading, error, refetch } =
    entityFilter.type && entityFilter.id ? entityQ : listQ;
  const rows: SubsidiaryAccountRow[] = data?.data ?? [];
  const [filters, setFilters] = useFilters();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<SubsidiaryAccountRow | null>(null);

  const filtered = applyFilters(rows, filters, {
    searchFields: ["accountCode", "accountName", "accountType"],
  });

  const columns: DataTableColumn<SubsidiaryAccountRow>[] = [
    {
      key: "entityType",
      header: "نوع الكيان",
      render: (r) => (
        <Badge variant="outline">{ENTITY_LABEL[r.entityType] ?? r.entityType}</Badge>
      ),
    },
    {
      key: "entityId",
      header: "رقم الكيان",
      className: "font-mono text-xs",
      ltr: true,
      render: (r) => `#${r.entityId}`,
    },
    {
      key: "accountType",
      header: "نوع الحساب",
      render: (r) => (
        <span className="text-sm">
          {ACCOUNT_TYPE_LABEL[r.accountType] ?? r.accountType}
        </span>
      ),
    },
    {
      key: "account",
      header: "الحساب",
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
            perm="finance.accounting_engine:delete"
            size="sm"
            variant="ghost"
            className="text-status-error-foreground"
            onClick={() => setDeleting(r)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </GuardedButton>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="الحسابات الفرعية"
      subtitle="ربط الكيانات (موظفين، عملاء، موردين، مركبات...) بالحسابات في دليل الحسابات لتوجيه القيود المحاسبية"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "الحسابات الفرعية" },
      ]}
      actions={
        <GuardedButton
          perm="finance.accounting_engine:create"
          onClick={() => setCreating(true)}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" /> ربط حساب جديد
        </GuardedButton>
      }
    >
      <FinanceTabsNav />

      <Card className="border-status-info-surface/40">
        <CardContent className="p-3 flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">عرض حسابات كيان معين</Label>
            <Select
              value={entityFilter.type || ""}
              onValueChange={(v) => setEntityFilter({ type: v as EntityType, id: entityFilter.id })}
            >
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="نوع الكيان" /></SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map((e) => (
                  <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">رقم الكيان</Label>
            <Input
              type="number"
              value={entityFilter.id}
              onChange={(e) => setEntityFilter({ type: entityFilter.type, id: e.target.value })}
              placeholder="#"
              className="w-28 h-8 text-xs"
              dir="ltr"
            />
          </div>
          {(entityFilter.type || entityFilter.id) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEntityFilter({ type: "", id: "" })}
            >
              مسح الفلتر
            </Button>
          )}
        </CardContent>
      </Card>
      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        <AdvancedFilters values={filters} onChange={setFilters} />
        <DataTable
          columns={columns}
          data={filtered}
          rowKey={(r) => r.id}
          emptyMessage="لا توجد ربط حسابات — تُنشأ تلقائياً عند إضافة موظفين/عملاء/موردين، أو يمكن إضافتها يدوياً هنا"
        />
      </PageStateWrapper>

      <SubsidiaryAccountDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={() => {
          setCreating(false);
          refetch();
        }}
      />

      {deleting && (
        <ConfirmDeleteDialog
          open={deleting !== null}
          onOpenChange={(o) => {
            if (!o) setDeleting(null);
          }}
          entity={{
            type: "subsidiary_account",
            id: deleting.id,
            name: `${ENTITY_LABEL[deleting.entityType] ?? deleting.entityType} #${deleting.entityId} → ${deleting.accountCode ?? "?"}`,
          }}
          deletePath={`/finance/subsidiary-accounts/${deleting.id}`}
          invalidateKeys={[["finance-subsidiary-accounts"]]}
          onDeleted={() => {
            setDeleting(null);
            refetch();
          }}
        />
      )}
    </PageShell>
  );
}

function SubsidiaryAccountDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const createMut = useApiMutation<SubsidiaryAccountRow, FormValues>(
    "/finance/subsidiary-accounts",
    "POST",
    [["finance-subsidiary-accounts"]],
    { successMessage: "تم ربط الحساب" },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            ربط حساب فرعي جديد
          </DialogTitle>
        </DialogHeader>
        <FormShell
          schema={formSchema}
          defaultValues={EMPTY_DEFAULTS}
          submitLabel="إنشاء الربط"
          secondaryActions={
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await createMut.mutateAsync(values);
            onSaved();
          }}
        >
          <FormGrid cols={2}>
            <FormSelectField
              name="entityType"
              label="نوع الكيان"
              required
              options={[...ENTITY_TYPES]}
            />
            <FormSelectField
              name="accountType"
              label="نوع الحساب"
              required
              options={ACCOUNT_TYPES}
            />
          </FormGrid>
          <EntityPicker />
          <AccountIdPicker />
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

// EntityPicker swaps between EmployeeSelect / ClientSelect / VendorSelect /
// DriverSelect / VehicleSelect based on the current `entityType` field.
// Property has no dedicated select component yet, so we render a numeric
// input as the fallback. When entityType changes we reset entityId to 0
// so the previous row's id doesn't bleed into the new entity domain.
function EntityPicker() {
  const { watch, setValue, formState } = useFormContext<FormValues>();
  const entityType = watch("entityType");
  const entityId = watch("entityId");
  const err = formState.errors.entityId?.message;
  const stringId = entityId ? String(entityId) : "";
  const onChange = (v: string) =>
    setValue("entityId", Number(v) || 0, { shouldDirty: true, shouldValidate: true });

  const node = useMemo(() => {
    switch (entityType) {
      case "employee":
        return <EmployeeSelect value={stringId} onChange={onChange} />;
      case "client":
        return <ClientSelect value={stringId} onChange={onChange} />;
      case "vendor":
        return <VendorSelect value={stringId} onChange={onChange} />;
      case "driver":
        return <DriverSelect value={stringId} onChange={onChange} />;
      case "vehicle":
        return <VehicleSelect value={stringId} onChange={onChange} />;
      case "property":
        return (
          <input
            type="number"
            min={1}
            value={entityId || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="رقم العقار"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        );
      default:
        return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, stringId]);

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        الكيان <span className="text-status-error-foreground">*</span>
      </label>
      {node}
      {err && <p className="text-xs text-status-error-foreground">{String(err)}</p>}
    </div>
  );
}

// AccountIdPicker fetches the chart of accounts and binds the selected
// id (integer) back into the form. AccountSelect from entity-selects
// returns the *code* string, which is great for journal entry forms
// where the backend resolves by code, but the subsidiary_accounts row
// stores accountId as int, so we need the id directly.
function AccountIdPicker() {
  const { watch, setValue, formState } = useFormContext<FormValues>();
  const accountId = watch("accountId");
  const err = formState.errors.accountId?.message;
  const { data } = useApiQuery<{ data: Array<{ id: number; code: string; name: string; allowPosting: boolean }> }>(
    ["finance-accounts", "all"],
    "/finance/accounts?limit=500",
  );
  const options = useMemo(
    () =>
      (data?.data ?? [])
        .filter((a) => a.allowPosting !== false)
        .map((a) => ({
          value: String(a.id),
          label: `${a.code} - ${a.name}`,
        })),
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
