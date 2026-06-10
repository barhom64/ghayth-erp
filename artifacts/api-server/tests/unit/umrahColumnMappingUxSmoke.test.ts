import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  UMRAH_FIELD_GROUPS,
  UMRAH_FIELD_GROUP_LABELS_AR,
  UMRAH_FIELD_LABELS_AR,
  MUTAMER_HEADER_MAP,
  VOUCHER_HEADER_MAP,
  suggestColumnMapping,
  normalizeImportRows,
} from "../../src/lib/umrahImportEngine.js";

/**
 * §2 of #1870 — pins the column-mapping UX overhaul:
 *
 *   1. Every engine field is catalogued into a logical group
 *      (pilgrim / identity / agent / group / travel / status / finance)
 *      so the wizard dropdown can render headings instead of a flat
 *      ~50-item alphabetical list.
 *
 *   2. /umrah/import/header-maps surfaces groups + groupLabels.
 *
 *   3. SearchableSelect honours an optional `group` per option.
 *
 *   4. Wizard's column-mapping step uses SearchableSelect (with the
 *      operator search box) + group headings, replacing the plain
 *      Radix Select that overflowed the page on imports with many
 *      headers.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const SEARCHABLE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/shared/searchable-select.tsx"),
  "utf8",
);
const WIZARD = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/import-wizard.tsx"),
  "utf8",
);

describe("engine — UMRAH_FIELD_GROUPS catalog", () => {
  it("declares an Arabic label for every group key", () => {
    // Without parity the dropdown headings would render raw English
    // identifiers ("agent", "finance") to Arabic operators.
    const groupKeys = new Set(Object.values(UMRAH_FIELD_GROUPS));
    for (const key of groupKeys) {
      expect(UMRAH_FIELD_GROUP_LABELS_AR[key]).toBeTruthy();
    }
  });

  it("covers every distinct mutamer engine field", () => {
    const fields = new Set(Object.values(MUTAMER_HEADER_MAP));
    for (const field of fields) {
      expect(
        UMRAH_FIELD_GROUPS[field],
        `mutamer field "${field}" is missing from UMRAH_FIELD_GROUPS — operator dropdown would put it in "أخرى" rather than its logical section`,
      ).toBeTruthy();
    }
  });

  it("covers every distinct voucher engine field", () => {
    const fields = new Set(Object.values(VOUCHER_HEADER_MAP));
    for (const field of fields) {
      expect(
        UMRAH_FIELD_GROUPS[field],
        `voucher field "${field}" is missing from UMRAH_FIELD_GROUPS — would land in "أخرى"`,
      ).toBeTruthy();
    }
  });

  it("every catalogued field also has a canonical Arabic label", () => {
    // Parity with UMRAH_FIELD_LABELS_AR — catalog + label must agree
    // so the dropdown can show both a heading and a meaningful row.
    for (const field of Object.keys(UMRAH_FIELD_GROUPS)) {
      expect(
        UMRAH_FIELD_LABELS_AR[field],
        `field "${field}" is in the group catalog but missing from UMRAH_FIELD_LABELS_AR`,
      ).toBeTruthy();
    }
  });

  it("groups agent + sub-agent fields together (operator's mental model)", () => {
    expect(UMRAH_FIELD_GROUPS.nuskAgentNumber).toBe("agent");
    expect(UMRAH_FIELD_GROUPS.agentName).toBe("agent");
    expect(UMRAH_FIELD_GROUPS.nuskCode).toBe("agent");
    expect(UMRAH_FIELD_GROUPS.subAgentName).toBe("agent");
  });

  it("keeps finance fields cleanly separated from operational fields", () => {
    expect(UMRAH_FIELD_GROUPS.totalAmount).toBe("finance");
    expect(UMRAH_FIELD_GROUPS.nuskStatus).toBe("finance");
    expect(UMRAH_FIELD_GROUPS.status).toBe("status");
    // status and nuskStatus are different fields (pilgrim vs invoice)
    // — operators distinguish them via the group heading.
    expect(UMRAH_FIELD_GROUPS.status).not.toBe(UMRAH_FIELD_GROUPS.nuskStatus);
  });
});

describe("engine — fuzzy suggest still works after catalog addition", () => {
  it("exact match returns confidence=1", () => {
    const out = suggestColumnMapping(["رقم المعتمر"], "mutamers");
    expect(out["رقم المعتمر"]).toMatchObject({
      target: "nuskNumber", confidence: 1, source: "exact",
    });
  });

  it("near-match fuzzy returns source='fuzzy' above MIN_CONFIDENCE", () => {
    // Same string with extra whitespace + ى vs ي — should still match
    // because normaliseHeader strips them.
    const out = suggestColumnMapping(["رقم  المعتمر "], "mutamers");
    expect(out["رقم  المعتمر "]).toBeTruthy();
    expect(out["رقم  المعتمر "].target).toBe("nuskNumber");
  });
});

describe("route — /import/header-maps surfaces groups + groupLabels", () => {
  it("imports UMRAH_FIELD_GROUPS and UMRAH_FIELD_GROUP_LABELS_AR from the engine", () => {
    expect(ROUTE).toMatch(/UMRAH_FIELD_GROUPS,\s*[\r\n]+\s*UMRAH_FIELD_GROUP_LABELS_AR,/);
  });

  it("returns groups + groupLabels for both fileTypes", () => {
    // Both mutamers and vouchers branches must expose the catalog —
    // otherwise the dropdown falls back to "أخرى" everywhere.
    expect(ROUTE).toMatch(/mutamers: \{[\s\S]{0,250}groups: UMRAH_FIELD_GROUPS,/);
    expect(ROUTE).toMatch(/mutamers: \{[\s\S]{0,250}groupLabels: UMRAH_FIELD_GROUP_LABELS_AR,/);
    expect(ROUTE).toMatch(/vouchers: \{[\s\S]{0,250}groups: UMRAH_FIELD_GROUPS,/);
    expect(ROUTE).toMatch(/vouchers: \{[\s\S]{0,250}groupLabels: UMRAH_FIELD_GROUP_LABELS_AR,/);
  });
});

describe("SearchableSelect — group-aware rendering", () => {
  it("SelectOption type declares the optional group field", () => {
    expect(SEARCHABLE).toMatch(/group\?: string;/);
  });

  it("caps the popover at max-h-\\[60vh\\] so it never overflows the page", () => {
    expect(SEARCHABLE).toMatch(/max-h-\[60vh\]/);
  });

  it("partitions options into CommandGroups when any option has a group", () => {
    expect(SEARCHABLE).toMatch(/const hasGroups = options\.some\(\(o\) => o\.group\)/);
    expect(SEARCHABLE).toMatch(/<CommandGroup key=\{g\} heading=\{g\}>/);
  });
});

describe("wizard — column-mapping panel uses SearchableSelect with grouped options", () => {
  it("headerMaps query type carries the new groups + groupLabels fields", () => {
    expect(WIZARD).toMatch(/groups\?: Record<string, string>;/);
    expect(WIZARD).toMatch(/groupLabels\?: Record<string, string>;/);
  });

  it("dbFields sort is group-first, then Arabic label within group", () => {
    // Without group-first sort the operator sees the old flat
    // alphabetical mix where "اسم الوكيل" sits between "اسم المعتمر"
    // and "اسم المجموعة" — destroys the section mental model.
    expect(WIZARD).toMatch(/groupOrder\.indexOf\(gA\)/);
    expect(WIZARD).toMatch(/\(labels\[a\] \?\? a\)\.localeCompare\(labels\[b\] \?\? b, "ar"\)/);
  });

  it("each option carries its Arabic group label as the SearchableSelect `group`", () => {
    expect(WIZARD).toMatch(/group: groupLabels\[groups\[field\] \?\? "other"\] \?\? "أخرى"/);
  });

  it("replaces the plain Radix Select inside the mapping panel", () => {
    // The mapping grid must use SearchableSelect; the old `<Select`
    // path was a flat 50-item list with no search.
    expect(WIZARD).toMatch(/data-testid="column-mapping-grid"/);
    // SearchableSelect is referenced in the per-header column-mapping
    // loop with the wizard-specific Arabic search placeholder. That
    // string is unique to this site, so finding it pins the swap
    // without depending on JSX block boundary regexes that drift as
    // surrounding markup evolves.
    expect(WIZARD).toContain('searchPlaceholder="ابحث في الحقول..."');
    expect(WIZARD).toContain('emptyText="لا توجد حقول مطابقة"');
  });

  it("the 'ignore column' sentinel gets its own group heading", () => {
    // So the operator can find it without scrolling past the 50
    // field options.
    expect(WIZARD).toMatch(/value: "_none", label: "— تجاهل العمود —", group: "إجراء"/);
  });

  it("preserves the smart-mapping suggestion badge under each row", () => {
    // The badges (تطابق دقيق / اقتراح) are what tell the operator
    // which columns the system auto-detected vs guessed. Lose them
    // and the operator is back to confirming every column manually.
    expect(WIZARD).toContain("data-testid={`mapping-suggestion-${h}`}");
    expect(WIZARD).toContain("✓ تطابق دقيق");
    expect(WIZARD).toContain("💡 اقتراح:");
  });
});

describe("engine — normalizeImportRows agent / count header resolution", () => {
  // Regression: a vendor data file used NUSK terminology ("الوكيل
  // الرئيسي" / "الوكيل الفرعي") and "إجمالي المعتمرين" instead of the
  // dictionary's "اسم الوكيل" / "اسم المكتب" / "عدد المعتمرين". The
  // exact (trim-only) matcher silently dropped those columns, leaving
  // agentId/subAgentId NULL and mutamerCount 0 after import. Both the
  // new aliases AND the folded matcher must keep these resolving.
  it("maps main-agent / sub-agent terminology on mutamer rows", () => {
    const [row] = normalizeImportRows(
      [{ "الوكيل الرئيسي": "شركة الوكيل", "الوكيل الفرعي": "مكتب فرعي" }],
      "mutamers",
    );
    expect(row.agentName).toBe("شركة الوكيل");
    expect(row.subAgentName).toBe("مكتب فرعي");
  });

  it("maps pilgrim-count + agent variants on voucher rows", () => {
    const [row] = normalizeImportRows(
      [{ "إجمالي المعتمرين": "42", "الوكيل الرئيسي": "وكيل", "المكتب": "فرع" }],
      "vouchers",
    );
    expect(row.mutamerCount).toBe("42");
    expect(row.agentName).toBe("وكيل");
    expect(row.subAgentName).toBe("فرع");
  });

  it("folds hamza / alif-maksura / tatweel spelling variants", () => {
    // "إجمالى المعتمرين" (alif-maksura) + tatweel'd agent header — no
    // exact dictionary key exists for these, only the folded matcher
    // resolves them.
    const [row] = normalizeImportRows(
      [{ "إجمالى المعتمرين": "7", "الوكيـل الرئيسـي": "و" }],
      "vouchers",
    );
    expect(row.mutamerCount).toBe("7");
    expect(row.agentName).toBe("و");
  });

  it("operator custom mapping still overrides the dictionary", () => {
    const [row] = normalizeImportRows(
      [{ "عمود مخصص": "قيمة" }],
      "mutamers",
      { "عمود مخصص": "agentName" },
    );
    expect(row.agentName).toBe("قيمة");
  });
});
