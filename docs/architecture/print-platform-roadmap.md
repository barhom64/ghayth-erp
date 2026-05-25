# Print Platform — Roadmap & Phase Status

Companion to [`print-platform.md`](./print-platform.md). Tracks which roadmap phases ship today, which are stubbed-via-contract, and what each remaining phase needs before it can land for real.

## Phase status

| Phase | Status | Where to look | Notes |
|------:|--------|---------------|-------|
| 0 — Architecture Lock | ✅ Shipped | `docs/architecture/print-platform.md` + `scripts/src/lint-patterns.mjs` rule `direct-pdf-generation` | PR #1098 |
| 1 — Print Core Foundation | ✅ Shipped | `lib/print/*` + `src/lib/print-client.ts` | Built incrementally across #1072 → #1102; SDK landed in #1105 |
| 2 — DataTable/ListPage integration | ✅ Shipped | `<ListPage printEntityType="..." exports={{...}}>` | PR #1106 |
| 3 — Template Registry | ✅ Shipped (manifest layer) | `/templates/*.json` + `pnpm audit:print-templates` | PR #1105 |
| 4 — Render Engine | ✅ Shipped (HTML/Excel) | `lib/print/adapters/{a4,thermal,label,excel}.ts` | Puppeteer-PDF + docx as future extensions |
| 5 — Branding Engine | ✅ Shipped (DB-driven) | `lib/print/branchContext.ts` | Per-branch letterhead + headerOverride/footerOverride |
| 6 — Signature & Verification | ✅ Shipped | `lib/print/verify.ts` + `routes/printVerify.ts` | PR #1102 — QR + public verify endpoint |
| 7 — Archive Integration | ⚠️ Partial | `lib/print/printStorage.ts` writes to GCS; DMS index link is the missing piece | Next-up |
| 8 — Print Audit | ✅ Shipped | `lib/print/printJobsLogger.ts` + `print_jobs` table | Restored in #1081 (was silently broken) |
| 9 — Delivery Engine | ⚠️ Contract only | `lib/print/delivery.ts` | This PR. `download` channel is functional today; email/SMS/WhatsApp are stubs |
| 10 — Scheduler / Batch | ⚠️ Contract + in-process backend | `lib/print/queue.ts` | This PR. Swap to BullMQ when Redis lands |
| 11 — AI Document Layer | ⚠️ Contract only | `lib/print/ai.ts` | This PR. No-op until a provider is wired in |

## Phase 7 — Archive Integration

**Status:** half done. `lib/print/printStorage.ts` already writes to GCS when `PRIVATE_OBJECT_DIR` is configured. What's missing:

1. **DMS link** — every `print_jobs` row should index into the Documents domain so the user opening an entity sees the printed copy in their "Documents" tab.
2. **Retention policy** — currently nothing prunes old artifacts. ZATCA mandates 7-year retention for tax invoices; HR docs are typically longer.
3. **Immutable flag** — Phase 6 already locked the audit row (no delete); the storage object needs the same.

**Next PR:** add `archive_path` column on `print_jobs` (already there) + a row in `documents` per render + a `documents.printJobId` FK. Then a Documents tab on every entity detail page lists the printed copies.

## Phase 9 — Delivery Engine

**Status:** [contract shipped](../../artifacts/api-server/src/lib/print/delivery.ts). Today only the `download` channel works (returns bytes for the SPA). Each provider implementation needs:

| Channel | Provider option | Required config | Open question |
|---|---|---|---|
| `email` | AWS SES, SendGrid, SMTP | SMTP creds / API key | Which provider? Latency vs. spam-rate trade-off. |
| `whatsapp` | WhatsApp Business API (Meta direct or Twilio) | App ID + phone-number ID + access token | Template pre-approval process — each new doc type needs a template registered with Meta. |
| `sms` | Twilio, Saudi local providers (Unifonic, Marketing Cloud) | API creds + sender ID | Local sender-ID registration takes 2-3 weeks. |
| `internal_inbox` | None (table-based) | None — just a DB write | Trivial once Notifications module owns inbox UI. |
| `webhook` | None | None — caller supplies URL | Add an HMAC signature so receivers verify origin. |

**Code lives in:** `lib/print/delivery.ts`. Drop a `delivery/emailChannel.ts` implementing the `DeliveryChannel` interface, register it at startup via `registerChannel(...)`, done.

## Phase 10 — Scheduler / Batch

**Status:** [contract shipped](../../artifacts/api-server/src/lib/print/queue.ts) with a usable in-process backend. The in-process queue:

- ✓ Idempotency key (no duplicate scheduled reports)
- ✓ Retry with exponential backoff
- ✓ Delayed execution via `runAt`
- ✗ Loses jobs on restart
- ✗ Doesn't survive multi-worker deployments

**Switch to BullMQ when:**
1. Redis is configured (`config.redis.configured === true`)
2. The worker process model is decided — single shared process vs. dedicated print-worker

Cron-driven scheduled reports (the `node-cron` jobs in `cron-scheduler.ts`) can call `enqueue({ kind: "scheduled_report", … })` today; the in-process backend will execute them in-band. When BullMQ lands, the same cron job hands the work off to a worker pool.

## Phase 11 — AI Document Layer

**Status:** [contract shipped](../../artifacts/api-server/src/lib/print/ai.ts). The four AI-assisted helpers (`suggestTemplate`, `summariseReport`, `draftLetter`, `detectAuditAnomalies`) all route through an `AiClient` interface. The default is `NoopAiClient` which returns `AI_NOT_CONFIGURED` for everything except `detectAuditAnomalies` (empty array).

**The codebase already has Anthropic config** (`AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, `aiIntegrations.anthropicBaseUrl`) — a concrete `AnthropicAiClient` would:

1. Take a Claude API key from config
2. Implement each method by calling the Messages API with a system prompt tuned for the task
3. Be registered via `setAiClient(new AnthropicAiClient(config))` at startup

**Cost reality check:** every print of a 5-page report would trigger ~3K tokens at ~$0.003 per render. At 1000 renders/day that's $3/day or $90/month. Reasonable, but worth tracking — the per-call cost should be logged to a billing table so finance can see it.

**Out of scope until we say otherwise:**
- Auto-generating templates without human review
- Letting AI modify production templates
- Anything that prints AI-generated content as authoritative (every AI draft must go through the `draft → review → approved → published` workflow before serving to print)

## Sequencing

The remaining work is a stack — each layer assumes the one below is solid:

```
┌──────────────────────────────────────────────────────────┐
│ Phase 11 — AI                                            │
│   needs: Phase 3 (templates) + Phase 9 (delivery channel │
│          to send the AI-drafted letter) +                │
│          Anthropic credentials                           │
├──────────────────────────────────────────────────────────┤
│ Phase 10 — Scheduler / BullMQ                            │
│   needs: Redis cluster +                                 │
│          worker process model decision                   │
├──────────────────────────────────────────────────────────┤
│ Phase 9 — Delivery (email / SMS / WhatsApp)              │
│   needs: provider choice + creds + WhatsApp template     │
│          pre-approval                                    │
├──────────────────────────────────────────────────────────┤
│ Phase 7 — Archive (DMS link)                             │
│   needs: documents table FK + Documents tab UI on entity │
│          detail pages                                    │
├──────────────────────────────────────────────────────────┤
│ Phases 0–6 + 8 — SHIPPED                                 │
└──────────────────────────────────────────────────────────┘
```

Phase 7 is the next concrete next step (no external dependencies). Phases 9/10/11 are blocked on infrastructure decisions, not engineering.

## How a future provider lights up

Drop-in example for the email channel:

```ts
// artifacts/api-server/src/lib/print/delivery/emailChannel.ts
import type { DeliveryChannel, DeliveryInput, DeliveryResult } from "../delivery.js";
import { config } from "../../config.js";
import { SES } from "@aws-sdk/client-ses"; // or @sendgrid/mail, etc.

export class EmailChannel implements DeliveryChannel {
  kind = "email" as const;
  private ses = new SES({ region: config.aws.region });
  isAvailable() { return Boolean(config.email.fromAddress && config.aws.region); }
  async send(input: DeliveryInput): Promise<DeliveryResult> {
    // …call SES.sendRawEmail with the document.bytes as attachment…
    return { channel: "email", ok: true, messageId: "<provider-id>" };
  }
}

// in lib/print/index.ts startup:
if (config.email.configured) registerChannel(new EmailChannel());
```

No other Print Platform file changes. The SDK call `sendDocument({ channel: "email", … })` starts succeeding the moment the registration runs.

Same pattern for `WhatsAppChannel`, `SmsChannel`, `AnthropicAiClient`, `BullMQBackend`. Every "phase" beyond 0-8 boils down to: implement the contract, register it, done.
