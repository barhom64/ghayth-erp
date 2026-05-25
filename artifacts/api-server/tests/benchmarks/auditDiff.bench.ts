// Benchmarks for `computeDiff` — called on every mutation that
// writes to `audit_log`. The hot path is comparing before/after
// snapshots that contain anywhere from 5 to ~60 columns (HR
// contracts, invoices, journal entries).
//
import { bench, describe } from "vitest";
import { computeDiff } from "../../src/lib/auditDiff.js";

const smallBefore = {
  id: 1,
  name: "Ali",
  status: "active",
  email: "ali@example.com",
  branchId: 3,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-02T00:00:00Z",
};
const smallAfter = { ...smallBefore, status: "inactive", email: "ali@new.com", updatedAt: "2025-02-01T00:00:00Z" };

function wideRow(seed: number): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: seed,
    companyId: 1,
    branchId: 2,
    ref: `INV-2026-${String(seed).padStart(6, "0")}`,
    clientId: seed * 7,
    issueDate: "2026-05-20",
    dueDate: "2026-06-20",
    subtotal: 1234.5,
    discountTotal: 0,
    taxTotal: 185.18,
    grandTotal: 1419.68,
    paid: 0,
    balance: 1419.68,
    currency: "SAR",
    fxRate: 1,
    status: "draft",
    notes: "lorem ipsum dolor sit amet consectetur adipiscing elit",
    createdAt: "2026-05-20T08:30:00Z",
    updatedAt: "2026-05-20T08:30:00Z",
  };
  // Inflate to ~50 cols by adding domain attributes.
  for (let i = 0; i < 30; i++) {
    row[`field_${i}`] = i % 3 === 0 ? `text-${i}` : i;
  }
  return row;
}

const wideBefore = wideRow(42);
const wideAfter = (() => {
  const a = { ...wideRow(42) };
  a.status = "approved";
  a.balance = 0;
  a.paid = 1419.68;
  a.field_5 = "changed";
  a.field_17 = 9999;
  return a;
})();

const nestedBefore = {
  ...smallBefore,
  address: { city: "Riyadh", zip: "12345" },
  tags: ["vip", "billing"],
};
const nestedAfter = {
  ...smallBefore,
  address: { city: "Jeddah", zip: "23456" },
  tags: ["vip", "billing", "watchlist"],
};

describe("computeDiff", () => {
  bench("small row, 2 changed fields", () => {
    computeDiff(smallBefore, smallAfter);
  });

  bench("wide row (~50 cols), 4 changed fields", () => {
    computeDiff(wideBefore, wideAfter);
  });

  bench("wide row, no changes (identity diff — must walk every key)", () => {
    computeDiff(wideBefore, wideBefore);
  });

  bench("pure create (before=null)", () => {
    computeDiff(null, wideAfter);
  });

  bench("pure delete (after=null)", () => {
    computeDiff(wideBefore, null);
  });

  bench("nested objects + arrays (JSON.stringify path)", () => {
    computeDiff(nestedBefore, nestedAfter);
  });

  bench("both null (early return)", () => {
    computeDiff(null, null);
  });
});
