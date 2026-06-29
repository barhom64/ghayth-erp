import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { SearchableSelect } from "@/components/shared/searchable-select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ProductCreateForm } from "@/components/shared/product-create-form";
import { isStockItem, ITEM_TYPE_LABEL } from "@/lib/item-type";

const FREE_VALUE = "_free";

export interface ProductSelectProps {
  value: string;
  /** Returns the selected product id ("" when the free-line option is
   *  chosen) plus the full product row so the parent can snap fields. */
  onChange: (id: string, product?: any) => void;
  /** Show a "+ منتج جديد" action that opens the unified product form in a drawer. */
  allowCreate?: boolean;
  /** Exclude non-stock items (service / digital / asset) — for warehouse movements. */
  stockableOnly?: boolean;
  /** Offer a "— بند حر —" option (invoice free line). */
  includeFreeOption?: boolean;
  freeOptionLabel?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Reusable product/item selector built on SearchableSelect. When
 * `allowCreate` is set, the "+ منتج جديد" action opens the FULL unified
 * product-creation form in a drawer (not a truncated quick-add); on save
 * the new product is selected and returned to the parent.
 */
export function ProductSelect({
  value,
  onChange,
  allowCreate = false,
  stockableOnly = false,
  includeFreeOption = false,
  freeOptionLabel = "— بند حر —",
  placeholder = "اختر المنتج",
  className,
  disabled,
}: ProductSelectProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const { data: productsData, refetch } = useApiQuery<{ data: any[] }>(["warehouse-products-select"], "/warehouse/products?limit=500");
  const allProducts = productsData?.data || [];
  const products = stockableOnly
    ? allProducts.filter((p: any) => isStockItem(p.itemType))
    : allProducts;

  const options = [
    ...(includeFreeOption ? [{ value: FREE_VALUE, label: freeOptionLabel }] : []),
    ...products.map((p: any) => ({
      value: String(p.id),
      label: `${p.name}${p.sku ? ` · ${p.sku}` : ""}`,
      // D-2 (توجيه إبراهيم) — شارة النوع (منتج/خدمة/…) عند نقطة الاختيار في بند
      // الفاتورة، فيميّز المستخدم الخدمة من المنتج دون فتح الكتالوج المحاسبي.
      sublabel: ITEM_TYPE_LABEL[String(p.itemType ?? "product")],
    })),
  ];

  // When the parent holds "" and a free option exists, surface the free line
  // as the selected entry (matches the invoice "free line" default).
  const selectValue = value || (includeFreeOption ? FREE_VALUE : "");

  return (
    <>
      <SearchableSelect
        options={options}
        value={selectValue}
        onValueChange={(v) => {
          if (v === FREE_VALUE || v === "") {
            onChange("", undefined);
            return;
          }
          const p = products.find((x: any) => String(x.id) === v);
          onChange(v, p);
        }}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        onCreateNew={allowCreate ? () => setCreateOpen(true) : undefined}
        createNewLabel="+ منتج جديد"
      />

      {allowCreate && (
        <Sheet open={createOpen} onOpenChange={setCreateOpen}>
          <SheetContent side="left" className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader className="mb-4">
              <SheetTitle>إضافة منتج جديد</SheetTitle>
            </SheetHeader>
            <ProductCreateForm
              draftKey="warehouse_product_create_inline"
              showAttachments={false}
              onCancel={() => setCreateOpen(false)}
              onCreated={async (created) => {
                await refetch();
                onChange(String(created.id), created);
                setCreateOpen(false);
              }}
            />
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
