# Communications Unification

> Status: Phases 1–4 (expand) shipped. Phase 5 (page consolidation) and
> the contract step of Phase 4 (drop legacy tables) remain.

## Background

After PRs #1174, #1194, #1214, #1245 the system shipped a strong **platform**
layer for communications (provider registry, DLP, observability, vendor
settings, inbox UI). But an audit revealed **7 concrete duplications**
between the new layer and the legacy paths that existed before it. The
risk: multiple `communication paradigms` coexist, the user experience
fragments, and bugs hide in the seams.

This document is the consolidation roadmap. Phase 1 lives in this PR.

## Audit findings (concrete duplications)

1. **Two send endpoints** — `POST /inbox/send` (new) and `POST /communications/send` (legacy) both insert to queues + log.
2. **Email queue inserts scattered** — `inbox.ts`, `communications.ts`, `support.ts`, `admin.ts`, `employees.ts` each insert directly to `email_queue` with the same shape, no shared helper.
3. **DLP not applied uniformly** — only `/inbox/send` ran `applyDlp()` before queuing. The other 4 callers bypassed it.
4. **Two log tables** — `communications_log` (user-facing) and `notification_log` (system fallback) have nearly identical schemas.
5. **Three queue tables** — `email_queue` + `sms_queue` + `whatsapp_queue` with parallel structures.
6. **Two user-facing pages** — `/inbox` (new, thread-based) and `/communications` (legacy, monitor-style) both render the same underlying data.
7. **Two correspondence creation paths** — `/create/communications/letters-create` and `/create/comms/correspondence-create`.

## Phase 1 — Send-path seam (this PR)

**Goal:** every outbound message in the system flows through a SINGLE
function. DLP is enforced uniformly. Audit + event emission are uniform.

**Change:**

- New module `lib/messageSender.ts` exports `sendMessage(input)`:
  - DLP scan via `communicationControl.applyDlp()` — blocked rules write `blocked_dlp` to `communications_log`, no queue insert
  - Writes `communications_log` row (always, for audit)
  - Inserts to channel queue (`email_queue` / `sms_queue` / `whatsapp_queue`)
  - Looks up `getActiveProviders(channel)` and records the order in the emitted event (informational; failover happens in queue workers)
  - Emits `communications.{channel}.sent` event + audit log
  - Never throws — failures fail closed (block)

- `inbox.ts` refactored to call `sendMessage()` (its old private `dispatchSend()` removed).

- **Follow-up commits in this same PR** will refactor:
  - `routes/communications.ts /send` → call `sendMessage()`, keep the endpoint as a back-compat shim that returns 200 then 410 with deprecation header
  - `routes/support.ts` ticket reply → `sendMessage()` (currently bypasses DLP)
  - `routes/admin.ts` broadcast → `sendMessage()` (currently bypasses DLP)
  - `routes/employees.ts` termination letter → `sendMessage()` (currently bypasses DLP)

## Phase 2 — Email experience (next PR)

- `email_folders` table (inbox/sent/drafts/spam/trash + custom labels)
- `email_attachments` + object storage
- `email_signatures` per-user
- Scheduled send (`scheduledFor` column on `email_queue`)
- **IMAP / Microsoft Graph mailbox sync** — biggest piece, separate slice (OAuth flow + token refresh + message thread reconciliation)

## Phase 3 — Workspaces (next PR)

- `/workspace` — Employee daily view: today's tasks + unread messages + recent calls + meetings
- `/manager-workspace` — Team activity + approvals queue + KPIs

## Phase 4 — Table consolidation (EXPAND shipped)

Migration `221_message_log_outbound_queue.sql`:

- **Created** `message_log` (superset of `communications_log` + `notification_log`)
- **Created** `outbound_queue` (superset of `email_queue` + `sms_queue` + `whatsapp_queue`)
- **Backfilled** both new tables from legacy rows (idempotent — `NOT EXISTS` clause on `(legacySource, legacyId)`)
- **`messageSender.sendMessage()` now dual-writes** to both legacy + new tables. Failure on the new table is logged but non-fatal during the soak.
- **`v_message_log_all`** view exposed for readers to migrate to without breaking older endpoints.

What the **contract** step (next PR) will do:

1. Migrate readers (`inbox.ts /threads`, dashboard counts, BI reports) to read from `message_log` / `v_message_log_all`.
2. Migrate queue workers (`cronScheduler.ts email_queue_drain` etc.) to poll `outbound_queue` instead of legacy queues.
3. Once a soak period passes with no traffic on legacy paths, drop `communications_log`, `notification_log`, `email_queue`, `sms_queue`, `whatsapp_queue`.

Why expand-then-contract: the legacy tables back hundreds of code paths
(BI dashboards, audit exports, cron drains, the public /portal). Flipping
storage in one PR would create a huge blast radius. The dual-write +
soak approach lets every reader migrate independently behind a single
unified storage.

## Phase 5 — Page consolidation (last)

- Deprecate `/communications` for users; redirect to `/inbox`. Keep `/communications` as **admin-only monitor**
- Pick one create-correspondence path; redirect the other
- Move PBX control panel under communication-control as a tab

## Remaining work

- **Phase 4 contract**: drop legacy log + queue tables once readers and workers migrate.
- **Phase 5**: deprecate `/communications` for users, unify correspondence creation paths, move PBX control under communication-control as a tab.
- **Phase 2.x**: IMAP / Microsoft Graph mailbox sync (large, separate slice — OAuth flow + token refresh + thread reconciliation).
