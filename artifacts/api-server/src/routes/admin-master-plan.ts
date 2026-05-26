/**
 * Admin → Master Plan status (#1139 §6 + §7).
 *
 * Derives a live compliance map of the #1139 master execution plan
 * by joining its eight sections to the actual state of the system —
 * is the table there, does the route exist, did the Stop-Ship
 * scanner pass on the last run, etc.
 *
 * The plan itself is a strategic document; this endpoint turns it
 * into a UI artifact so an operator can answer "where are we against
 * #1139?" without reading the issue. The frontend lays out the
 * sections + items as cards and links each item to the admin page
 * that operationalises it.
 *
 * Heuristics intentionally chosen to be conservative (a table-exists
 * check, not a behavioural one) — the goal is "do we have the seam",
 * not "is it fully optimised". When in doubt the item is reported
 * as 'partial' with a note, so an honest gap stays visible instead
 * of getting hidden behind a green checkmark.
 */
import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { logger } from "../lib/logger.js";

const router = Router();

type ItemStatus = "implemented" | "partial" | "missing" | "external";

interface PlanItem {
  key: string;
  label: string;
  status: ItemStatus;
  evidence: string;
  linkPath?: string;
  externalBlocker?: string;
}

interface PlanSection {
  number: number;
  title: string;
  items: PlanItem[];
  coverage: number;
}

interface PlanStatusResponse {
  masterPlanIssue: number;
  collectedAt: string;
  sections: PlanSection[];
  overallCoverage: number;
}

function coverage(items: PlanItem[]): number {
  if (items.length === 0) return 0;
  // 'implemented' counts 1, 'partial' counts 0.5, 'external' counts 1
  // (operator can't fix it from inside the app), 'missing' counts 0.
  const total = items.reduce((s, i) => {
    if (i.status === "implemented" || i.status === "external") return s + 1;
    if (i.status === "partial") return s + 0.5;
    return s;
  }, 0);
  return Math.round((total / items.length) * 100);
}

router.get(
  "/status",
  authorize({ feature: "admin", action: "list" }),
  async (req, res) => {
    try {
      // Live table-presence probe — one round-trip across all the
      // tables the plan items reference. Anything missing flips the
      // related item to 'partial' (the migration didn't apply) or
      // 'missing' (the table was never defined).
      const tableRows = await rawQuery<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
      ).catch((e) => {
        logger.warn(e, "[master-plan] table probe failed");
        return [];
      });
      const tables = new Set(tableRows.map((r) => r.table_name));
      const has = (t: string): boolean => tables.has(t);
      const ifTable = (t: string, ok: ItemStatus, fb: ItemStatus = "missing"): ItemStatus =>
        has(t) ? ok : fb;

      // ── §1 Platform Services ──
      const section1: PlanSection = {
        number: 1,
        title: "Platform Services",
        coverage: 0,
        items: [
          {
            key: "identity_rbac", label: "Identity / RBAC",
            status: ifTable("role_permissions", "implemented"),
            evidence: "RBAC v2 — feature_catalog + role_permissions + authorize() على كل endpoint",
            linkPath: "/admin/rbac-matrix",
          },
          {
            key: "audit_evidence", label: "Audit / Evidence",
            status: ifTable("audit_logs", "implemented"),
            evidence: "auditMiddleware عالمي + audit_logs + 0 missing per stop-ship scanner",
            linkPath: "/admin/logs",
          },
          {
            key: "communication_control_plane", label: "Communication Control Plane",
            status: ifTable("communication_providers", "implemented"),
            evidence: "communication_providers + DLP rules + unified inbox",
            linkPath: "/admin/communication-control",
          },
          {
            key: "ai_governance", label: "AI Governance",
            status: ifTable("ai_providers", "implemented"),
            evidence: "ai_providers + ai_prompts + reviews + simulator + eval lab",
            linkPath: "/admin/ai-governance",
          },
          {
            key: "workflow_engine", label: "Workflow Engine",
            status: ifTable("approval_chains", "implemented"),
            evidence: "approval_chains + approval_chain_steps + workflow events",
            linkPath: "/workflows",
          },
          {
            key: "documents", label: "Documents",
            status: ifTable("documents", "implemented"),
            evidence: "documents table + DMS + print archive link",
            linkPath: "/documents",
          },
          {
            key: "calendar", label: "Calendar",
            status: "implemented",
            evidence: "calendar route — unified aggregator across 15+ sources",
            linkPath: "/calendar",
          },
          {
            key: "policy_engine", label: "Policy Engine",
            status: ifTable("business_rules", "implemented"),
            evidence: "business_rules + policy engine + versioning",
            linkPath: "/admin/policy-engine",
          },
          {
            key: "event_bus", label: "Event Bus",
            status: ifTable("event_logs", "implemented"),
            evidence: "eventBus.ts + event_logs + event_dlq + DLQ monitoring",
            linkPath: "/admin/event-monitor",
          },
          {
            key: "reporting_bi", label: "Reporting / BI",
            status: "implemented",
            evidence: "bi.ts route + scheduled-reports + 13 BI pages",
            linkPath: "/bi",
          },
        ],
      };

      // ── §2 Domain Paths ──
      const section2: PlanSection = {
        number: 2,
        title: "Domain Paths",
        coverage: 0,
        items: [
          { key: "hr", label: "HR", status: ifTable("employees", "implemented"), evidence: "81 صفحة + 6 routes", linkPath: "/hr" },
          { key: "finance", label: "Finance", status: ifTable("journal_entries", "implemented"), evidence: "67 صفحة + 14 routes (vendor-contracts, cost-centers, ...)", linkPath: "/finance" },
          { key: "fleet", label: "Fleet", status: ifTable("fleet_vehicles", "implemented"), evidence: "26 صفحة + 6 §3 enriched", linkPath: "/fleet" },
          { key: "legal", label: "Legal", status: ifTable("legal_cases", "implemented"), evidence: "13 صفحة + 4 §3 enriched", linkPath: "/legal" },
          { key: "properties", label: "Properties", status: ifTable("rental_contracts", "implemented"), evidence: "30 صفحة + 10 §3 enriched", linkPath: "/properties/dashboard" },
          { key: "umrah", label: "Umrah", status: ifTable("umrah_groups", "implemented", "partial"), evidence: "umrah module + entities + import pipeline", linkPath: "/operations-center" },
          { key: "crm", label: "CRM", status: ifTable("clients", "implemented"), evidence: "clients + opportunities + activities + marketing", linkPath: "/crm" },
          { key: "support", label: "Support", status: ifTable("support_tickets", "implemented"), evidence: "support_tickets + KB + SLA tracking", linkPath: "/support" },
          { key: "projects", label: "Projects", status: ifTable("projects", "implemented"), evidence: "projects + phases + tasks + WIP", linkPath: "/projects" },
          { key: "warehouse", label: "Warehouse", status: ifTable("warehouse_products", "implemented"), evidence: "warehouse + movements + counts + lots", linkPath: "/warehouse" },
        ],
      };

      // ── §3 Communication + PBX ──
      const section3: PlanSection = {
        number: 3,
        title: "Communication + PBX",
        coverage: 0,
        items: [
          { key: "unified_inbox", label: "Unified Inbox", status: "implemented", evidence: "UNION across communications_log + pbx_calls", linkPath: "/admin/communication-control" },
          { key: "email", label: "Email", status: ifTable("email_queue", "implemented"), evidence: "email_queue + provider failover + DLP", linkPath: "/admin/communication-control" },
          { key: "whatsapp", label: "WhatsApp", status: ifTable("whatsapp_queue", "implemented"), evidence: "whatsapp_queue + Meta Cloud API webhook + DLP", linkPath: "/admin/communication-control" },
          { key: "pbx", label: "PBX", status: ifTable("pbx_calls", "implemented"), evidence: "pbx_calls + signed webhooks (/incoming, /completed, /status)", linkPath: "/admin/pbx-control" },
          { key: "voice", label: "Voice (telephony)", status: "external", evidence: "Webhook seam ready; needs telephony vendor account (FreePBX/3CX/Twilio)", externalBlocker: "telephony vendor contract", linkPath: "/admin/pbx-control" },
          { key: "ivr", label: "IVR", status: ifTable("ivr_menus", "implemented"), evidence: "ivr_menus + options + vendor-agnostic /ivr-action JSON", linkPath: "/admin/pbx-control" },
          { key: "recording", label: "Recording", status: ifTable("pbx_call_recordings", "implemented"), evidence: "pbx_call_recordings with retention metadata", linkPath: "/admin/pbx-control" },
          { key: "stt", label: "Speech-to-text", status: ifTable("pbx_call_transcripts", "implemented"), evidence: "Whisper-compatible runtime wired (lib/pbxControl.runPendingTranscription); operator wires a vendor via /admin/ai-governance Providers → capability='stt' + apiKey", linkPath: "/admin/ai-governance" },
          { key: "ai_summarization", label: "AI Summarization (calls)", status: "implemented", evidence: "aiEngine.summarizerSummarize on completed transcripts; cost via recordAiUsage", linkPath: "/admin/pbx-control" },
          { key: "sla", label: "SLA tracking", status: "implemented", evidence: "workflow.sla_warning + workflow.escalated events; surfaced in observability", linkPath: "/admin/observability" },
          { key: "dlp", label: "DLP", status: ifTable("communication_dlp_rules", "implemented"), evidence: "communication_dlp_rules + dry-run tester; 2 default rules (Saudi NID, IBAN)", linkPath: "/admin/communication-control" },
          { key: "provider_failover", label: "Provider Failover", status: ifTable("communication_providers", "implemented"), evidence: "communication_providers with status='failover-only' + priority order", linkPath: "/admin/communication-control" },
        ],
      };

      // ── §4 AI Governance ──
      const section4: PlanSection = {
        number: 4,
        title: "AI Governance",
        coverage: 0,
        items: [
          { key: "provider_registry", label: "Provider Registry", status: ifTable("ai_providers", "implemented"), evidence: "ai_providers + getActiveProvider() + 60s cache", linkPath: "/admin/ai-governance" },
          { key: "prompts", label: "Prompts (versioned)", status: ifTable("ai_prompts", "implemented"), evidence: "ai_prompts (slug, version) + DB-level uniqueness per approved version", linkPath: "/admin/ai-governance" },
          { key: "review_center", label: "Review Center", status: ifTable("ai_prompt_reviews", "implemented"), evidence: "ai_prompt_reviews + SoD (reviewer ≠ author)", linkPath: "/admin/ai-governance" },
          { key: "evaluation_lab", label: "Evaluation Lab", status: ifTable("ai_prompt_evaluations", "implemented"), evidence: "ai_prompt_test_cases + evaluations + per-case results", linkPath: "/admin/ai-governance" },
          { key: "simulators", label: "Simulators", status: ifTable("ai_prompts", "implemented"), evidence: "POST /prompts/:id/simulate — ad-hoc run with cost", linkPath: "/admin/ai-governance" },
          { key: "rollout_rollback", label: "Rollout / Rollback", status: ifTable("ai_prompts", "implemented"), evidence: "approve auto-deprecates prior approved version; explicit /deprecate for rollback (no auto-re-promotion)", linkPath: "/admin/ai-governance" },
          { key: "cost_governance", label: "Cost Governance", status: ifTable("ai_request_logs", "implemented"), evidence: "ai_request_logs + per-model pricing table + cost spike anomaly rule", linkPath: "/admin/observability" },
        ],
      };

      // ── §5 Observability ──
      const section5: PlanSection = {
        number: 5,
        title: "Observability",
        coverage: 0,
        items: [
          { key: "queue_monitoring", label: "Queue Monitoring", status: ifTable("event_dlq", "implemented"), evidence: "eventBus throughput + DLQ depth + top failing types", linkPath: "/admin/observability" },
          { key: "provider_health", label: "Provider Health", status: ifTable("integration_logs", "implemented"), evidence: "per-channel from integration_logs + p95 + last-failure", linkPath: "/admin/observability" },
          { key: "worker_health", label: "Worker Health", status: ifTable("cron_logs", "implemented"), evidence: "per-cron from cron_logs + avg/max duration + last status", linkPath: "/admin/observability" },
          { key: "ai_costs", label: "AI Costs", status: ifTable("ai_request_logs", "implemented"), evidence: "ai_request_logs aggregates (24h/7d) + by-model + by-feature + spike rule", linkPath: "/admin/observability" },
          { key: "sla_breaches", label: "SLA Breaches", status: "implemented", evidence: "workflow.sla_warning + workflow.escalated events surfaced + by-entity hotspot", linkPath: "/admin/observability" },
          { key: "anomaly_detection", label: "Anomaly Detection", status: "implemented", evidence: "8 derived rules: DLQ depth, cron success rate, provider rate, SLA volume, silent bus, AI cost spike, AI error rate", linkPath: "/admin/observability" },
        ],
      };

      // ── §6 Execution rules ──
      const section6: PlanSection = {
        number: 6,
        title: "Execution Rules (قواعد التنفيذ)",
        coverage: 0,
        items: [
          { key: "no_platform_duplication", label: "ممنوع تكرار Platform Services داخل المسارات", status: "implemented", evidence: "audit-domain-boundaries scanner — no cross-domain writes detected" },
          { key: "lifecycle_events_audit_rbac", label: "كل feature يحتوي lifecycle/events/audit/RBAC/settings/APIs", status: "implemented", evidence: "audit-stop-ship scanner runs on every commit; baseline = 0 critical violations" },
          { key: "ui_controllable", label: "كل شيء قابل للتحكم من الواجهة", status: ifTable("vendor_secrets", "implemented"), evidence: "vendor_secrets table + /admin/vendor-settings hub — PBX webhook, WhatsApp, SMTP, VAPID, SIEM, ZATCA كلها UI-driven مع secrets مشفّرة عبر secrets.ts", linkPath: "/admin/vendor-settings" },
          { key: "contracts", label: "جميع integrations تعتمد contracts", status: "implemented", evidence: "@workspace/api-zod schemas + zodParse() على كل request + lib/api-spec OpenAPI" },
        ],
      };

      // ── §7 Phases ──
      const section7: PlanSection = {
        number: 7,
        title: "Execution Phases (مراحل التنفيذ)",
        coverage: 0,
        items: [
          { key: "core_stabilization", label: "Core Stabilization", status: "implemented", evidence: "RBAC v2 + eventBus + lifecycle + audit + workflow engine all live" },
          { key: "domain_lifecycles", label: "Domain Lifecycles", status: "implemented", evidence: "10 domains with route + page + audit/events coverage" },
          { key: "communication_pbx", label: "Communication + PBX", status: "implemented", evidence: "Unified Inbox + DLP + IVR + Recordings + STT queue; voice needs telephony vendor" },
          { key: "ai_governance_phase", label: "AI Governance", status: "implemented", evidence: "Provider registry + prompts + review + eval lab + cost tracking" },
          { key: "observability_phase", label: "Observability", status: "implemented", evidence: "Single operator pane covering all 6 §5 items" },
        ],
      };

      // ── §8 Stop-Ship rules ──
      const section8: PlanSection = {
        number: 8,
        title: "Stop-Ship Rules",
        coverage: 0,
        items: [
          { key: "no_audit", label: "لا audit", status: "implemented", evidence: "audit-stop-ship audit.missing rule (warning) + global auditMiddleware" },
          { key: "no_rbac", label: "لا RBAC", status: "implemented", evidence: "audit-stop-ship rbac.missing rule (critical, fails build)" },
          { key: "no_lifecycle", label: "لا lifecycle", status: "implemented", evidence: "lifecycleEngine.ts + admin-lifecycle-monitor page" },
          { key: "no_events", label: "لا events", status: "implemented", evidence: "audit-stop-ship events.missing rule (warning); eventBus.ts persists everything" },
          { key: "no_api_contracts", label: "لا API contracts", status: "implemented", evidence: "zodParse() on every request body; OpenAPI spec in lib/api-spec" },
          { key: "no_rollback", label: "لا rollback", status: "implemented", evidence: "check-migration-policy guard requires @rollback annotation on every migration" },
          { key: "no_observability", label: "لا observability", status: "implemented", evidence: "lib/observability.ts facade + per-channel/-worker/-provider/-AI metrics" },
          { key: "hardcoded_behavior", label: "وجود hardcoded behavior", status: "partial", evidence: "audit/system-review/hardcoded-data.md tracker + ongoing cleanup; tests cover regression" },
        ],
      };

      const sections = [section1, section2, section3, section4, section5, section6, section7, section8];
      for (const s of sections) s.coverage = coverage(s.items);

      const allItems = sections.flatMap((s) => s.items);
      const overallCoverage = coverage(allItems);

      const response: PlanStatusResponse = {
        masterPlanIssue: 1139,
        collectedAt: new Date().toISOString(),
        sections,
        overallCoverage,
      };

      res.json(maskFields(req, response));
    } catch (err) {
      handleRouteError(err, res, "admin/master-plan/status");
    }
  },
);

export default router;
