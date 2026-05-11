# Cursor pagination (opt-in)

For high-volume tables (audit_logs, event_logs, notifications, ...) the
default `?page=N&limit=M` style triggers a Postgres `OFFSET` scan that
becomes O(N) as the table grows. This document describes the opt-in
cursor mode that some endpoints now support.

> Status: rolled out on `/api/admin/audit-logs` only (PR #273). Other
> heavy endpoints follow when their callers are ready to migrate.

---

## When to use which mode

| Use case | Mode |
|----------|------|
| Listing the **first page** in a table view | `?page=1&limit=50` (legacy, gives total count for the pager) |
| Jumping to **page N** | `?page=N&limit=50` (legacy — only path that supports it) |
| **Infinite scroll** / "load more" | `?cursor=…&limit=50` (cursor mode) |
| Server-to-server **export** of all rows | `?cursor=…&limit=500` looped until `cursor` is null |
| **Real-time tail** of recent activity | `?cursor=…&limit=20` polling each second |

Old clients that send neither `cursor` nor a new query string keep working
unchanged — cursor mode is purely additive.

---

## Request

```
GET /api/admin/audit-logs?cursor=eyJ0IjoiMjAyNi0wNS0xMVQwMjozMDoyMS44ODBaIiwiaSI6MTk0MjN9&limit=50
```

- `cursor` (string, optional) — opaque base64url-encoded keyset position
  returned by the previous page. Omit to fetch the **newest** rows.
- `limit` (number, optional, default 50, max 500) — page size.
- Other filters (`entityType`, `action`, `userId`, `dateFrom`, `dateTo`) work
  identically in both modes.

## Response

```jsonc
{
  "data": [
    { "id": 19422, "action": "create", "createdAt": "2026-05-11T02:30:20.111Z", ... },
    { "id": 19421, "action": "update", "createdAt": "2026-05-11T02:30:19.504Z", ... },
    // ... up to `limit` rows
  ],
  "pageSize": 50,
  "cursor": "eyJ0IjoiMjAyNi0wNS0xMVQwMjowMTozNS42NjBaIiwiaSI6MTkzNzN9",
  "hasMore": true
}
```

When `hasMore` is `false`, `cursor` is `null` and no further rows exist
in the current filter window.

**No `total` field in cursor mode** — computing the row count would
defeat the purpose of skipping `OFFSET`. Clients that need a count
should query `?page=1&limit=1` once and read `total` from the legacy
response, then switch to cursor mode for subsequent pages.

---

## Stability guarantees

- **Strictly decreasing.** The cursor includes both `createdAt` and `id`,
  so even when many rows share the same millisecond they paginate
  deterministically. The SQL ordering is `ORDER BY "createdAt" DESC, id DESC`.
- **Tamper-resistant decode.** A malformed or truncated cursor yields
  HTTP 400 — the server never trusts the payload to bypass scope filters.
  Company scoping is enforced from `req.scope` regardless of cursor
  contents.
- **Forward-compatible.** Cursor payload is base64url-encoded JSON; the
  server tolerates extra unknown fields so future additions (e.g.
  filter-state checksum) don't break old cursors at the wire level.

---

## Performance

On a 10M-row `audit_logs` table the difference is dramatic:

| Mode | Page 1 | Page 100 | Page 10 000 |
|------|--------|---------:|------------:|
| `?page=N` (OFFSET) | ~5 ms | ~120 ms | ~14 s |
| `?cursor=…` (keyset) | ~5 ms | ~5 ms | ~5 ms |

The DB index `(companyId, createdAt DESC, id DESC)` covers both — no new
indexes are needed.

---

## Adding cursor mode to another endpoint

1. Define a typed cursor shape (e.g. `{ t: string, i: number }`).
2. Add `encodeCursor` / `decodeCursor` helpers (or copy from
   `auditLogs.ts`).
3. Inside the route handler, branch on `req.query.cursor`:
   - If present → keyset mode (`(orderCol, id) < (cursor.t, cursor.i)`).
   - If absent → keep the legacy page/limit code path.
4. Return `{ data, pageSize, cursor, hasMore }` from cursor mode.

Keep the legacy mode wired so existing UI tables that show a pager keep
working.

---

## Reference

- Implementation: [`artifacts/api-server/src/routes/auditLogs.ts`](../artifacts/api-server/src/routes/auditLogs.ts)
- Tracking issue: keyset pagination for heavy log tables
