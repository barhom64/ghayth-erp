import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-16-P1 — server-mediated download for umrah attachments FE.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-16 audit §3.1):
 *   - `pages/umrah/attachments.tsx` table renderer must route
 *     downloads through `/api/documents/:id/download`, NOT a raw
 *     cloud URL.
 *   - That route carries ACL + access log + tenant guard +
 *     nosniff + soft-delete check (documents.ts:444-501).
 *
 * Non-goals (Permanent Hard Rails):
 *   - No backend route change.
 *   - No schema change (the fileUrl column stays for legacy).
 *   - No removal of fileUrl from the API response (U-16-P3 borderline).
 *
 * Failure modes pinned:
 *   - The page regressed back to `href={a.fileUrl}` → §A fails.
 *   - The page stopped going through `/api/documents/:id/download`
 *     → §B fails.
 *   - The page started routing `target="_blank"` directly to a
 *     `fileUrl`-derived URL → §C fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/umrah/attachments.tsx"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — No direct fileUrl link in the table renderer
// ─────────────────────────────────────────────────────────────────────────────
describe("U-16-P1 §A — page does NOT link directly to a.fileUrl", () => {
  it("no <a href={a.fileUrl}> pattern (raw cloud URL bypass)", () => {
    expect(PAGE).not.toMatch(/href=\{a\.fileUrl\}/);
  });

  it("no <a href={...fileUrl...} target=\"_blank\"> compound pattern", () => {
    // Same regression in a different shape — a derived var pointing at
    // the cloud URL with target=_blank would still bypass the server.
    expect(PAGE).not.toMatch(
      /href=\{[^}]*\bfileUrl[^}]*\}[^>]*target=["']_blank["']/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Server-mediated route is wired
// ─────────────────────────────────────────────────────────────────────────────
describe("U-16-P1 §B — downloads route through /api/documents/:id/download", () => {
  it("opens the server route via window.open(`/api/documents/${a.id}/download`)", () => {
    expect(PAGE).toMatch(
      /window\.open\(\s*`\/api\/documents\/\$\{\s*a\.id\s*\}\/download`/,
    );
  });

  it("renderer key flipped from `fileUrl` to `download`", () => {
    // Pinning the column key change locks the intent: the table now
    // shows a download action, not a raw URL field.
    expect(PAGE).toMatch(/key:\s*["']download["']/);
    expect(PAGE).not.toMatch(/key:\s*["']fileUrl["']/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Disabled state gated on storageKey (no orphan downloads)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-16-P1 §C — download action requires a storageKey", () => {
  it("the download button is only rendered when `a.storageKey` is truthy", () => {
    expect(PAGE).toMatch(/a\.storageKey\s*\?/);
  });
});
