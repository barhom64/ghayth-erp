import { describe, it, expect, vi, beforeAll } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// jsdom lacks the pointer-capture + scroll + ResizeObserver APIs that
// Radix/cmdk call when the listbox opens. Shim them locally so the shared
// test setup stays minimal.
beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
  (globalThis as any).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// Catalog the selector reads from. A stockable product + a non-stock
// service so we can assert both the snap and the stockable filter.
const PRODUCTS = [
  { id: 1, name: "شاي أخضر", sku: "TEA-1", sellPrice: 12.5, itemType: "product" },
  { id: 2, name: "استشارة", sku: "SVC-1", sellPrice: 300, itemType: "service" },
];

// Isolate ProductSelect from the data layer + the create-drawer chain.
vi.mock("@/lib/api", () => ({
  useApiQuery: () => ({ data: { data: PRODUCTS }, refetch: vi.fn() }),
  useApiMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/components/shared/product-create-form", () => ({
  ProductCreateForm: () => null,
}));

import { ProductSelect } from "./product-select";

// Mirrors how the invoice line consumes ProductSelect: the parent's
// onChange snaps description + unitPrice from the returned product.
function Harness({ stockableOnly = false }: { stockableOnly?: boolean }) {
  const [productId, setProductId] = useState("");
  const [description, setDescription] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  return (
    <div>
      <ProductSelect
        value={productId}
        includeFreeOption
        stockableOnly={stockableOnly}
        onChange={(id, p) => {
          setProductId(id);
          if (p) {
            setDescription(p.name + (p.sku ? ` (${p.sku})` : ""));
            setUnitPrice(String(p.sellPrice ?? ""));
          } else {
            setDescription("");
            setUnitPrice("");
          }
        }}
      />
      <div data-testid="description">{description}</div>
      <div data-testid="unitPrice">{unitPrice}</div>
    </div>
  );
}

const hasText = (needle: string) => (content: string) => content.includes(needle);

describe("ProductSelect", () => {
  it("snaps description + sellPrice when a catalog product is picked", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText(hasText("شاي أخضر")));

    expect(screen.getByTestId("description")).toHaveTextContent("شاي أخضر (TEA-1)");
    expect(screen.getByTestId("unitPrice")).toHaveTextContent("12.5");
  });

  it("hides non-stock items when stockableOnly is set", async () => {
    const user = userEvent.setup();
    render(<Harness stockableOnly />);

    await user.click(screen.getByRole("combobox"));

    expect(await screen.findByText(hasText("شاي أخضر"))).toBeInTheDocument();
    expect(screen.queryByText(hasText("استشارة"))).not.toBeInTheDocument();
  });

  it("shows the item-type badge (منتج / خدمة) on each option so service vs product is visible (D-2)", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox"));
    // both items listed, each carrying its type label as a sublabel
    expect(await screen.findByText(hasText("شاي أخضر"))).toBeInTheDocument();
    expect(await screen.findByText("منتج")).toBeInTheDocument(); // the product
    expect(await screen.findByText("خدمة")).toBeInTheDocument(); // the service
  });
});
