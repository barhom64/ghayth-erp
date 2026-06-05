import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_APPROVAL_CHAINS } from "../../src/lib/companyBootstrap.js";

// The approval engine was effectively disabled because every chainType passed
// to initiateApprovalChain() was different from the chainTypes seeded into
// approval_chains — so the lookup found nothing and returned
// requiresApproval=false (auto-approve). This guards the invariant: every
// chainType a caller passes must be seeded (by bootstrap + migration 250),
// otherwise that flow silently auto-approves again.

const CWD = process.cwd();
const SRC = resolve(CWD, "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

// All chainType string literals passed anywhere in the backend source.
function collectChainTypeLiterals(): Set<string> {
  const found = new Set<string>();
  const re = /chainType:\s*["']([a-z_]+)["']/g;
  for (const file of walk(SRC)) {
    const src = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) found.add(m[1]);
  }
  return found;
}

describe("approval chain coverage", () => {
  const seeded = new Set(DEFAULT_APPROVAL_CHAINS.map((c) => c.type));

  it("seeds a non-trivial set of chains, each with at least one step", () => {
    expect(seeded.size).toBeGreaterThanOrEqual(9);
    for (const c of DEFAULT_APPROVAL_CHAINS) {
      expect(c.roles.length, `chain "${c.type}" must have ≥1 step`).toBeGreaterThan(0);
    }
  });

  it("every chainType passed to initiateApprovalChain is seeded", () => {
    const used = collectChainTypeLiterals();
    const unseeded = [...used].filter((t) => !seeded.has(t));
    expect(
      unseeded,
      `These chainTypes are passed in code but not seeded (they would auto-approve):\n${unseeded.join(", ")}`,
    ).toEqual([]);
  });
});
