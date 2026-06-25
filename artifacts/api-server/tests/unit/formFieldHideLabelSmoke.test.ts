import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Label-duplication fix on journal-style line tables.
 *
 * Bug (from screenshot): the «بنود القيد» line tables render a
 * COLUMN-HEADER row naming «مدين»/«دائن», and then each cell's
 * NumberField *also* renders its own visible label «مدين»/«دائن» —
 * so the words appear twice (header + above every input).
 *
 * Root-cause fix: FormFieldWrapper (and its TextField / NumberField
 * consumers) gain a `hideLabel` prop that visually hides the label
 * via `sr-only` while keeping it for screen readers + the htmlFor
 * association. The journal-family line tables pass `hideLabel` on
 * the debit/credit cells because the column header already names
 * them.
 */

const WRAPPER = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/shared/form-field-wrapper.tsx"),
  "utf8",
);

const PAGES = {
  journal: "../../../ghayth-erp/src/pages/create/finance/journal-create.tsx",
  journalManual: "../../../ghayth-erp/src/pages/create/finance/journal-manual-create.tsx",
  recurring: "../../../ghayth-erp/src/pages/create/finance/recurring-journals-create.tsx",
  opening: "../../../ghayth-erp/src/pages/create/finance/opening-balances-create.tsx",
} as const;

function readPage(rel: string): string {
  return readFileSync(join(import.meta.dirname!, rel), "utf8");
}

describe("FormFieldWrapper — hideLabel root-cause affordance", () => {
  it("FormFieldWrapper accepts a hideLabel prop", () => {
    expect(WRAPPER).toMatch(/hideLabel\?: boolean/);
  });

  it("hideLabel applies sr-only to the Label (kept for a11y, hidden visually)", () => {
    expect(WRAPPER).toMatch(/className=\{cn\("text-sm font-medium", hideLabel && "sr-only"\)\}/);
  });

  it("does NOT delete the label — the text is still rendered for screen readers", () => {
    // The {label} child must still be present inside the <Label>.
    expect(WRAPPER).toMatch(/<Label[\s\S]{0,120}>\s*\{label\}/);
  });

  it("TextField + NumberField both forward hideLabel to the wrapper", () => {
    // 3 declarations (wrapper interface + TextField props + NumberField
    // props) and 3 pass-throughs into <FormFieldWrapper hideLabel=...>.
    const passThroughs = WRAPPER.match(/hideLabel=\{hideLabel\}/g);
    expect(passThroughs).not.toBeNull();
    expect(passThroughs!.length).toBeGreaterThanOrEqual(2);
  });
});

describe("journal-family line tables — debit/credit cells suppress the duplicate label", () => {
  it("journal-create: مدين + دائن NumberFields pass hideLabel", () => {
    const page = readPage(PAGES.journal);
    expect(page).toMatch(/label="مدين" hideLabel/);
    expect(page).toMatch(/label="دائن" hideLabel/);
    // The column header still names them (visible label lives there). Since the
    // page adopted the shared <LineItemsTable>, the header is a column config
    // (`header: "مدين"`) that the component renders as <th> — not literal page markup.
    expect(page).toMatch(/header: "مدين"/);
    expect(page).toMatch(/header: "دائن"/);
  });

  it("journal-manual-create: مدين + دائن NumberFields pass hideLabel", () => {
    const page = readPage(PAGES.journalManual);
    expect(page).toMatch(/label="مدين" hideLabel/);
    expect(page).toMatch(/label="دائن" hideLabel/);
    // Header carried by the shared <LineItemsTable> column config (see above).
    expect(page).toMatch(/header: "مدين"/);
    expect(page).toMatch(/header: "دائن"/);
  });

  it("recurring-journals-create: مدين + دائن NumberFields pass hideLabel", () => {
    const page = readPage(PAGES.recurring);
    expect(page).toMatch(/label="مدين" hideLabel/);
    expect(page).toMatch(/label="دائن" hideLabel/);
  });

  it("opening-balances-create: مدين + دائن NumberFields pass hideLabel", () => {
    const page = readPage(PAGES.opening);
    expect(page).toMatch(/label="مدين"\s+hideLabel/);
    expect(page).toMatch(/label="دائن"\s+hideLabel/);
  });
});
