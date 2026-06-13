# Umrah Repair — Remaining Work Roadmap (#2080 / Charter #1870)

**Status:** Planning document. No code change. Produced under the
owner's "full delegation + plan all remaining" directive
(2026-06-13).

This roadmap enumerates every remaining track, classifies each
phase as **autonomous-eligible** (I execute + self-merge under
the conditional runbook) or **hard-pause** (requires an explicit
owner go), and proposes an execution order.

---

## 0. ⚠️ Numbering reconciliation — owner decision needed

This session executed two tracks under ad-hoc identifiers that
**collide** with the canonical governance backlog:

| Identifier used this session | What we shipped | Canonical backlog meaning |
| --- | --- | --- |
| "U-11" | agent/sub-agent → financial client linkage + invoicing gate (5 PRs, merged) | **Report catalog 3-way match** (catalog ↔ routes ↔ pages) |
| "U-13" | main agent as billing entity (audit + P2 column, merged) | **Sensitive-permission isolation** (approve/cancel/close/print/export guards) |

The merged work is real and on `main`; renaming it retroactively
would break the #2080 audit trail. **Proposed resolution (owner
to ratify):**

- Keep the merged work under its descriptive track names:
  - **Track BILL-LINK** = "agent/sub-agent client linkage" (was
    "U-11" this session). **Closed.**
  - **Track BILL-MAIN** = "main agent as billing entity" (was
    "U-13" this session). **P2 merged, P3–P7 remain.**
- Reserve the canonical `U-NN` identifiers for the governance
  backlog items below, to avoid further collision.

Until ratified, this doc uses the descriptive names + maps each
to its canonical id where one exists.

---

## 1. Status snapshot (what's on `main` today)

| Track | State | Last merge SHA |
| --- | --- | --- |
| U-01 finance boundary | closed | (merged Wave 1) |
| U-02 transport boundary | closed | (merged Wave 1) |
| U-02b transport contract migration | **stopped at M5b** | `ad7c8fa1` |
| BILL-LINK (sess. "U-11") | **closed + protected** | `bc95bd1a` |
| BILL-MAIN (sess. "U-13") P2 | **merged (schema only)** | `e60a45cf` |
| Everything else (canonical U-03…U-19) | **not started** | — |

Protective surface live on `main`: 12 umrah smoke files, 207
invariants, guarding no-silent-invoicing / no-silent-client /
no-silent-linkage / boundary sentinels.

---

## 2. Permanent hard rails (never crossed, regardless of delegation)

These are absolute across every track and phase:

- ❌ No journal entry outside the finance engine.
- ❌ No silent client creation.
- ❌ No silent AR opening.
- ❌ No silent linkage (linkage always operator-confirmed).
- ❌ No editing issued/historical invoices.
- ❌ No hard-coded accounting mapping.
- ❌ No bulk silent anything.

## 3. Hard-pause classes (PR may be drafted, but merge requires explicit owner go)

- 🔴 Production behaviour change via flag activation.
- 🔴 GL / invoicing-engine behaviour change.
- 🔴 Policy default flip.
- 🔴 Destructive / archive / table drop.
- 🔴 Historical-data edit / backfill.

## 4. Autonomous-eligible classes (execute + self-merge under the conditional runbook)

- 🟢 Audit / findings docs (doc-only).
- 🟢 Additive nullable migration (no backfill, no FK lock).
- 🟢 New read-only route / report surfacing.
- 🟢 New operator-confirmed linker route (no silent write).
- 🟢 Detection-only preview/UX enrichment.
- 🟢 Regression / contract / e2e tests.
- 🟢 FE surfacing of existing data (no new logic).

**Conditional runbook (self-merge gate):** branch on latest main,
`mergeable_state=clean`, guard success on final HEAD, playwright
skipped/not-required, review threads = 0, diff within scope, no
lateral changes, no override. Any failure → BLOCKED, stop.

---

## 5. Track BILL-MAIN — main agent as billing entity (remaining)

Audit doc: `U-13_main_agent_billing_entity_audit.md`. P2 (column)
merged at `e60a45cf`.

| Phase | Scope | Class | Behaviour? | Migration? |
| --- | --- | --- | --- | --- |
| **P3** | Linker route `PUT /umrah/agents/:id/link-client` (existing-client only, operator-confirmed) + Audit/Event + FE button on agent detail + smoke | 🟢 autonomous | New linker UX; invoicing unchanged | No |
| **P4** | Engine fallback: under `main_agent_client`, `generateSalesInvoice` reads `agent.clientId` when sub-agent's is null | 🔴 hard-pause | **Yes — engine** | No |
| **P5** | Catalog default flip: `main_agent_client` default for NEW companies (existing keep their setting) | 🔴 hard-pause | **Yes — new-company default** | No |
| **P6** | Import preview re-orientation: surface unlinked MAIN agents under `main_agent_client` | 🟢 autonomous | Detection only | No |
| **P7** | Closure pack: contract/e2e proving import → link → invoice loop on the agent path | 🟢 autonomous | Tests only | No |

## 6. Track U-02b — transport boundary closure (remaining)

Plan doc: `U-02b_transition_plan.md`. Stopped at M5b (`ad7c8fa1`).

| Phase | Scope | Class | Behaviour? |
| --- | --- | --- | --- |
| **M6** | Lock legacy `/transport` writes read-only via flag activation for a pilot company | 🔴 hard-pause | **Yes — flag activation** |
| **M7** | Remove `postTransportExpenseGL` + its 2 callers once legacy writes are off | 🔴 hard-pause | **Yes — GL** |
| **M8** | Archive `umrah_transport` table | 🔴 hard-pause | **Yes — destructive** |

## 7. Canonical backlog — U-03 … U-19 (audit-first each)

Each starts with a 🟢 audit doc; execution phases classified after
the audit proves the gap. Grouped by the governance priority waves.

**Wave 2 — data & event integrity**
| Id | Goal | First step | Notable class |
| --- | --- | --- | --- |
| U-03 | Fix rejected event payloads (invoice.generated, commission.calculated) | 🟢 audit | likely 🟢 additive |
| U-07 | Backfill orphaned historical rows | 🟢 audit | 🔴 backfill = hard-pause |
| U-08 | E2E import test w/ false-success contract | 🟢 audit → 🟢 tests | 🟢 |

**Wave 3 — attribution & reports**
| Id | Goal | First step | Notable class |
| --- | --- | --- | --- |
| U-05 | agentId on commission plans + agent dim on JE | 🟢 audit | JE dim may be 🔴 |
| U-06 | Live payroll capture verification | 🟢 audit | 🟢 verify |
| U-04 | Complete commission_report | 🟢 audit | 🟢 surfacing |
| U-10 | Verify 11-policy effectiveness (no silent hardcode) | 🟢 audit | 🟢 |

**Wave 4 — inventory audit results**
| Id | Goal | Notable overlap |
| --- | --- | --- |
| U-12c | Calendar unified layers (canonical) | **partly done** by U-02b M5b transport_request layer; audit reconciles remainder |
| U-13c | Sensitive-permission isolation (canonical) | 🟢 audit → guards |
| U-16 | Document path flow via server | 🟢 audit |
| U-17 | Notification flow + wire notify* policies | 🟢 audit |
| U-14 | Unify print templates | 🟢 audit |

**Wave 5 — structural (scheduled last to avoid rebase churn)**
| Id | Goal |
| --- | --- |
| U-09 | Split `umrah-entities.ts` (5,836 lines) — **no parallel work on this file** |
| U-15 | Resolve packages/accommodations classification |
| U-18 | Rename list for charter-term alignment |
| U-19 | UX for import→link→invoice→collect journey |

---

## 8. Recommended execution order (under full delegation)

**Immediately autonomous (no owner gate beyond the runbook):**
1. **BILL-MAIN P3** — agent linker route + FE + smoke. Directly
   continues the ratified main-agent direction; additive +
   operator-confirmed; no engine/behaviour change.
2. **Canonical audits**, cheap and clarifying, in priority order:
   U-03 → U-10 → U-12c (reconcile vs M5b) → U-13c → U-08.
3. **U-08 e2e test** + **BILL-MAIN P7 closure tests** — pure test
   additions that harden everything already merged.

**Hard-pause queue (I draft + present; you greenlight each):**
- BILL-MAIN P4 (engine fallback) → P5 (default flip).
- U-02b M6 → M7 → M8 (the transport endgame).
- U-07 backfill, and any audit that surfaces a 🔴 phase.

**Sequencing rules carried from governance:**
- No two tracks touch `umrah-entities.ts` in parallel.
- U-09 (the big split) runs last.
- Every execution PR: template + green guard + #2080 closure
  comment + owner notified.

---

## 9. What I do next (this turn's commitment)

Under full delegation I will proceed autonomously through §8's
autonomous list, opening one small PR per phase, self-merging
only when the conditional runbook is fully green, and posting a
closure comment on #2080 after each. I will **stop and ask**
before any 🔴 hard-pause phase.

**Single open owner-decision:** ratify the §0 numbering
reconciliation (keep descriptive track names + reserve canonical
U-NN for the backlog). Everything else proceeds under delegation.
