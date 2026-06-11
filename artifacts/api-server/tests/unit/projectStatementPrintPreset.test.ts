import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── P3 — Project statement print preset (مستخلص المشروع) ────────────────────
// Adds a `project_statement` bespoke preset to the EXISTING print engine (no new
// engine): a read-only print view of a project's financial position (budget vs.
// actual cost vs. billed-to-client vs. remaining) plus a cost breakdown. Powered
// by a read-only data loader over the projects tables — no finance writes.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const RESOLVER = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/print/templateResolver.ts"),
  "utf8",
);
const LOADER = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/print/dataLoader.ts"),
  "utf8",
);

describe("P3 — project_statement preset registration", () => {
  it("registers the builder + BESPOKE_PRESETS entry + Arabic title", () => {
    expect(RESOLVER).toContain("function buildProjectStatementPreset()");
    expect(RESOLVER).toContain("project_statement: () => buildProjectStatementPreset()");
    expect(RESOLVER).toContain('project_statement: "مستخلص المشروع"');
    expect(RESOLVER).toContain('entityType: "project_statement"');
    expect(RESOLVER).toContain('presetKey: "project_statement_classic"');
  });

  it("renders budget/cost/billed/remaining tokens and a cost breakdown loop", () => {
    const i = RESOLVER.indexOf("function buildProjectStatementPreset()");
    const body = RESOLVER.slice(i, i + 2800);
    expect(body).toContain("{{entity.budget}}");
    expect(body).toContain("{{entity.totalCosts}}");
    expect(body).toContain("{{entity.totalBilled}}");
    expect(body).toContain("{{entity.remaining}}");
    expect(body).toContain("{{#each costs}}");
    expect(body).toContain("{{this.amount}}");
  });
});

describe("P3 — project_statement data loader is read-only", () => {
  it("wires a dispatch case + dedicated loader over project tables", () => {
    expect(LOADER).toContain('case "project_statement":');
    expect(LOADER).toContain("async function loadProjectStatement");
    expect(LOADER).toContain("FROM project_costs");
    expect(LOADER).toContain("project_boq_items");
  });

  it("never writes (a print view must not mutate finance/project state)", () => {
    const i = LOADER.indexOf("async function loadProjectStatement");
    const fn = LOADER.slice(i, i + 1600);
    expect(fn).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });
});

describe("P3 — project_statement is printable through the real registry", () => {
  it("listPrintableEntityTypes() includes it as a bespoke preset", async () => {
    const { listPrintableEntityTypes } = await import(
      "../../src/lib/print/templateResolver.js"
    );
    const ps = listPrintableEntityTypes().find((t) => t.id === "project_statement");
    expect(ps).toBeDefined();
    expect(ps!.hasBespokePreset).toBe(true);
    expect(ps!.label).toBe("مستخلص المشروع");
  });

  it("substitute() fills the statement tokens + cost rows (dynamic render)", async () => {
    const { substitute } = await import(
      "../../src/lib/print/variableSubstitution.js"
    );
    const branch = { companyName: "الضياء", branchName: "الرئيسي" } as Parameters<
      typeof substitute
    >[0]["branch"];
    const template =
      "الميزانية: {{entity.budget}} | المتبقي: {{entity.remaining}}\n" +
      "<table><tbody>{{#each costs}}<tr><td>{{@index}}</td><td>{{this.description}}</td><td>{{this.amount}}</td></tr>{{/each}}</tbody></table>";
    const data = {
      entity: { budget: 800000, totalCosts: 250000, totalBilled: 4150, remaining: 550000 },
      costs: [{ description: "تكلفة إنشاء", amount: 250000 }],
    };
    const out = substitute({ template, data, branch, isThermal: false });
    const norm = out.replace(/[,٬\s]/g, "");
    expect(norm).toContain("800000");
    expect(norm).toContain("550000");
    expect(norm).toContain("250000");
    expect(out).toContain("تكلفة إنشاء");
  });
});
