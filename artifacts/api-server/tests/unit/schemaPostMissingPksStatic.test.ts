import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Schema dump — missing PRIMARY KEY restoration (2026-06-15, third
 * in the schema-conformance series after #2389 + #2425).
 *
 * The pg_dump output that produces `db/schema_pre.sql` +
 * `db/schema_post.sql` lost the `ALTER TABLE … ADD CONSTRAINT
 * <t>_pkey PRIMARY KEY (id)` blocks for 15 tables. Production
 * almost certainly carries these PKs (the FKs that target them
 * would never have worked otherwise) but the dump did not.
 *
 * Trip-wire: migration 360 (`supplier_items`) FK
 * `defaultTaxCodeId REFERENCES tax_codes(id)` crashed every fresh
 * `provision-agent-db.sh` run since #2235 landed:
 *
 *   ERROR: there is no unique constraint matching given keys for
 *          referenced table "tax_codes"
 *
 * Fix: append the 15 missing `ADD CONSTRAINT … PRIMARY KEY (id)`
 * blocks to `schema_post.sql` (the right spot — that's where the
 * other ADD CONSTRAINT blocks live; schema_pre.sql carries CREATE
 * TABLEs, schema_post.sql carries the constraints + FKs).
 *
 * A migration approach (e.g. 371_restore_missing_primary_keys.sql)
 * would not help: migrations run AFTER schema_post.sql, so by the
 * time 371 ran, migration 360's FK would already have failed.
 *
 * Static pin (regex-only).
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const SCHEMA_POST = readFileSync(join(repoRoot, "db/schema_post.sql"), "utf8");

const EXPECTED_TABLES = [
  "accounting_allocation_results",
  "accounting_allocation_rules",
  "audit_logs_archive",
  "budget_approval_requests",
  "fleet_alerts",
  "integration_logs_archive",
  "numbering_assignments",
  "numbering_audit_logs",
  "numbering_counters",
  "numbering_schemes",
  "tax_codes",
  "umrah_attachments",
  "umrah_import_mapping_presets",
  "vendor_contracts",
  "wht_categories",
];

describe("schema_post.sql — restored primary keys", () => {
  for (const t of EXPECTED_TABLES) {
    it(`adds PRIMARY KEY on ${t}.(id)`, () => {
      const re = new RegExp(
        `ALTER TABLE ONLY public\\.${t}\\s*\\n\\s*ADD CONSTRAINT ${t}_pkey PRIMARY KEY \\(id\\)`,
      );
      expect(SCHEMA_POST, `missing PK block for ${t}`).toMatch(re);
    });
  }

  it("each PK appears exactly once (no duplicates)", () => {
    // A second occurrence would crash schema_post.sql with
    // `relation "<t>_pkey" already exists` on load.
    for (const t of EXPECTED_TABLES) {
      const re = new RegExp(`ADD CONSTRAINT ${t}_pkey PRIMARY KEY`, "g");
      const matches = SCHEMA_POST.match(re);
      expect(matches?.length, `expected exactly one PK declaration for ${t}`).toBe(1);
    }
  });

  it("the new block carries an audit-trail comment so future readers find the why", () => {
    expect(SCHEMA_POST).toMatch(/schema-conformance batch[\s\S]+?migrations 339 \+ 349[\s\S]+?supplier_items/);
  });

  it("does NOT touch existing constraint blocks (e.g. tasks_pkey, tax_codes_company_code_uniq)", () => {
    expect(SCHEMA_POST).toMatch(/ALTER TABLE ONLY public\.tasks\s*\n\s*ADD CONSTRAINT tasks_pkey PRIMARY KEY \(id\)/);
    expect(SCHEMA_POST).toMatch(/tax_codes_company_code_uniq UNIQUE \("companyId", code\)/);
  });
});
