/**
 * DataTable — استقرار ارتفاع التحميل (شكوى إبراهيم «الجداول طالعة نازلة»).
 *
 * كان التحميل يعرض ٥ صفوف هيكلية ثابتة ثم تتمدّد لصفحة بيانات كاملة (حتى ٢٠
 * صفًّا) فتقفز الصفحة لأسفل. الإصلاح: عدد صفوف الهيكل = حجم الصفحة الفعلي
 * (بحدّ ٢٠)، فيحجز التحميل ارتفاع الصفحة الكاملة ولا تقفز.
 *
 * اختبار سلوكي حقيقي يشغّل المكوّن المشترك خلف مئات الصفحات (يسدّ فجوة
 * «اختبار سلوكي للواجهة» التي يرصدها ghayth-review).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

// Force the desktop <table> branch (mobile renders cards, not rows).
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import { DataTable, type DataTableColumn } from "@workspace/ui-core";

function render(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => cleanup());

interface Row { id: number; name: string; amount: number; }
const columns: DataTableColumn<Row>[] = [
  { key: "name", header: "الاسم" },
  { key: "amount", header: "المبلغ" },
];

// Body skeleton rows = all <tr> minus the header row.
function skeletonRowCount(): number {
  const table = document.querySelector("table")!;
  return within(table).getAllByRole("row").length - 1;
}

describe("DataTable — استقرار ارتفاع التحميل", () => {
  it("يعرض عدد صفوف هيكلية = حجم الصفحة (١٠) لا ٥ الثابتة", () => {
    render(<DataTable columns={columns} data={[]} isLoading pageSize={10} searchPlaceholder={null} />);
    expect(skeletonRowCount()).toBe(10);
  });

  it("الافتراضي (٢٠) يحجز ٢٠ صفًّا فيطابق صفحة بيانات كاملة", () => {
    render(<DataTable columns={columns} data={[]} isLoading searchPlaceholder={null} />);
    expect(skeletonRowCount()).toBe(20);
  });

  it("يحدّ صفوف الهيكل بـ٢٠ حتى لحجم صفحة كبير (٥٠) تفاديًا لضجيج مفرط", () => {
    render(<DataTable columns={columns} data={[]} isLoading pageSize={50} searchPlaceholder={null} />);
    expect(skeletonRowCount()).toBe(20);
  });

  it("صفحة بلا ترقيم (pageSize=0) → ٨ صفوف كحدّ معقول", () => {
    render(<DataTable columns={columns} data={[]} isLoading pageSize={0} searchPlaceholder={null} />);
    expect(skeletonRowCount()).toBe(8);
  });
});
