import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the per-pilgrim activity timeline — closes the user's stated
 * requirement:
 *
 *   "بمجر يدخل المعتمر او يتم اصدار تأشيرة لابد يكون فيه تحديد يومي
 *    عن بيانات المعتمر دخل خرج"
 *
 * Reads audit_logs scoped to this pilgrim, LEFT JOINs users +
 * employees so the operator sees a human name (not an opaque
 * userId), returns the last 100 newest-first.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/pilgrim-detail.tsx"),
  "utf8",
);

describe("GET /umrah/pilgrims/:id/timeline", () => {
  it("registers under feature: umrah, action: view (read-only)", () => {
    expect(ROUTE).toMatch(/router\.get\("\/pilgrims\/:id\/timeline",\s*authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"view"\s*\}\)/);
  });

  it("404s when the pilgrim doesn't exist (clearer than empty data)", () => {
    // A 404 here means the operator typed a bad URL — distinct from
    // a real pilgrim with no events. Without the existence check,
    // both would return `{data: []}` and confuse debugging.
    const m = ROUTE.match(/router\.get\("\/pilgrims\/:id\/timeline"[\s\S]*?(?=router\.(?:get|post|patch|put|delete)\()/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/SELECT id FROM umrah_pilgrims WHERE id=\$1 AND "companyId"=\$2/);
    expect(m![0]).toMatch(/if \(!exists\) throw new NotFoundError\("المعتمر غير موجود"\)/);
  });

  it("filters by entity='umrah_pilgrims' AND entityId::text AND companyId (tenant-safe)", () => {
    // Defence in depth — without the companyId check a SQL injection
    // OR a stale audit_logs row from a different tenant could leak.
    expect(ROUTE).toMatch(/al\.entity = 'umrah_pilgrims'/);
    expect(ROUTE).toMatch(/al\."entityId" = \$1::text/);
    expect(ROUTE).toMatch(/al\."companyId" = \$2/);
  });

  it("LEFT JOINs users + employees so the userName is human-readable", () => {
    // employees.name preferred; falls back to users.email when the
    // operator hasn't fully filled out their employee record.
    // COALESCE keeps the field non-null even on system-triggered
    // events (where userId=NULL).
    expect(ROUTE).toMatch(/LEFT JOIN users u\s+ON u\.id = al\."userId"/);
    expect(ROUTE).toMatch(/LEFT JOIN employees e\s+ON e\.id = u\."employeeId"/);
    expect(ROUTE).toMatch(/COALESCE\(e\.name, u\.email\) AS "userName"/);
  });

  it("returns last 100 events DESC (newest first — flight-day events visible without scrolling)", () => {
    expect(ROUTE).toMatch(/ORDER BY al\."createdAt" DESC\s+LIMIT 100/);
  });

  it("response shape is { data, total } (matches list-endpoint convention)", () => {
    expect(ROUTE).toMatch(/res\.json\(\{ data: events, total: events\.length \}\)/);
  });
});

describe("pilgrim detail — timeline rendering", () => {
  it("ACTION_LABELS map covers create/update/delete + status change + bulk ops", () => {
    // The dictionary keys come from the actual audit_logs.action
    // values emitted by routes/umrah.ts. Pin the operationally-
    // important ones so a future "rename action" PR has to update
    // this label too.
    expect(PAGE).toMatch(/"umrah\.pilgrim\.created": "تم إنشاء الملف"/);
    expect(PAGE).toMatch(/"umrah\.pilgrim\.status_changed": "تغيّرت الحالة"/);
    expect(PAGE).toMatch(/"umrah\.pilgrims\.bulk_status_changed": "تغيير حالة دفعي"/);
  });

  it("unknown actions fall through to a humanised raw code (no blank cells)", () => {
    // Strips the "umrah." prefix so an unknown event reads as
    // "pilgrim.something_new" instead of the full path. Operators
    // get a hint; engineers can still grep for the exact action.
    expect(PAGE).toMatch(/ACTION_LABELS\[ev\.action\][\s\S]{0,300}ev\.action\.replace\("umrah\.", ""\)/);
  });

  it("fetches /umrah/pilgrims/:id/timeline alongside the pilgrim row", () => {
    expect(PAGE).toMatch(/\["umrah-pilgrim-timeline", id\]/);
    expect(PAGE).toMatch(/`\/umrah\/pilgrims\/\$\{id\}\/timeline`/);
  });

  it("refetchTimeline fires on status update + exemption toggle", () => {
    // Without these, the operator's action would update the row but
    // the timeline below would stay stale until a page refresh.
    // Verify both mutation paths refetch.
    expect(PAGE).toMatch(/refetch\(\);\s*refetchTimeline\(\);[\s\S]{0,500}toast\(\{ variant: "destructive", title: "خطأ في التحديث"/);
    expect(PAGE).toMatch(/refetch\(\);\s*refetchTimeline\(\);[\s\S]{0,500}setSavingExemption\(false\)/);
  });

  it("timeline card hidden on empty (no card for a brand-new pilgrim)", () => {
    // Avoids the "empty box" anti-pattern. When the create-event
    // audit log fires asynchronously, the very first page render
    // might have zero events; better no card than a misleading
    // empty one.
    expect(PAGE).toMatch(/\{timelineEvents\.length > 0 && \(/);
    expect(PAGE).toContain('data-testid="pilgrim-timeline-card"');
  });

  it("renders only the top 20 with a 'show more' tail when there are more (no DOM bloat)", () => {
    expect(PAGE).toMatch(/timelineEvents\.slice\(0, 20\)\.map/);
    expect(PAGE).toMatch(/timelineEvents\.length > 20 && \(/);
    expect(PAGE).toContain("و {timelineEvents.length - 20} حدث أقدم");
  });

  it("each row shows username (or 'النظام') + Arabic-formatted timestamp", () => {
    expect(PAGE).toMatch(/ev\.userName \?\? "النظام"/);
    // The pilgrim detail moved from `formatDateAr` to `formatUmrahDate`
    // (the umrah-specific wrapper that always renders Gregorian/Hijri
    // dual). The Arabic-formatted timestamp contract is unchanged —
    // the helper just delegates to formatDateBoth — but the smoke test
    // has to match the new symbol.
    expect(PAGE).toMatch(/formatUmrahDate\(ev\.createdAt\)/);
  });

  it("each row has a stable data-testid for e2e", () => {
    expect(PAGE).toContain("data-testid={`timeline-event-${ev.id}`}");
  });
});
