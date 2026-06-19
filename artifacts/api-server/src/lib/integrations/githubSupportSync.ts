/**
 * githubSupportSync — قدرة خادمة معزولة تربط تذاكر الدعم بـGitHub Issues.
 *
 * المعمارية (الدستور م.4–9): الدعم هو المسار القائد ويملك التذكرة وقرارها؛ هذا
 * التكامل خادمٌ يُرسل/يربط فقط. يستمع للحدث القانوني `support.ticket.created` عبر
 * registerCrossDomainHandler (إعادة 3× + DLQ)، فإن فشل GitHub لا يتعطّل إنشاء
 * التذكرة إطلاقًا. لا كتابة عابرة: يقرأ التذكرة والعميل ويكتب حصرًا حقول الربط
 * على support_tickets.
 *
 * النطاق: التذاكر ضمن الفئات المُهيّأة (الدستور م.5 — يعتمد حقل category القائم،
 * لا حقل جديد). الفئات قابلة للضبط per-company عبر config.categories، والافتراضي
 * ["technical"]. التوكن per-company في جدول integrations (type="github")، مُعمّى.
 */
import { registerCrossDomainHandler, type EventPayload } from "../eventBus.js";
import { rawQuery, rawExecute } from "../rawdb.js";
import { emitEvent } from "../businessHelpers.js";
import { getActiveIntegration } from "../integrationService.js";
import { logger } from "../logger.js";

const DEFAULT_SYNC_CATEGORIES = ["technical"];
const GITHUB_API = "https://api.github.com";

interface SupportTicketRow {
  id: number;
  companyId: number;
  branchId: number | null;
  ref: string | null;
  title: string;
  description: string | null;
  category: string | null;
  priority: string | null;
  status: string | null;
  clientId: number | null;
  slaDeadline: string | null;
  githubIssueNumber: number | null;
}

interface ClientRow {
  name: string | null;
  phone: string | null;
  email: string | null;
}

interface GithubIssue {
  number: number;
  html_url: string;
}

/** النطاق: تُزامَن التذكرة إن كانت فئتها ضمن المجموعة المُهيّأة (الافتراضي technical). */
export function shouldSyncCategory(category: string | null, categories: string[]): boolean {
  return category != null && categories.includes(category);
}

/** الفئات المُزامَنة من إعداد التكامل، أو الافتراضي عند غيابها/خطئها. */
export function resolveSyncCategories(config: Record<string, unknown>): string[] {
  const raw = config.categories;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((c) => String(c));
  }
  return DEFAULT_SYNC_CATEGORIES;
}

/** جسم الـIssue (عربي) من التذكرة + مقدّم الشكوى + رابط عميق للنظام. */
export function buildIssueBody(
  ticket: Pick<SupportTicketRow, "id" | "ref" | "category" | "priority" | "status" | "description" | "slaDeadline">,
  reporter: string,
  ghaythBaseUrl: string,
): string {
  const lines: (string | null)[] = [
    `**التذكرة:** ${ticket.ref ?? ticket.id}`,
    `**الفئة:** ${ticket.category ?? "—"}`,
    `**الأولوية:** ${ticket.priority ?? "—"}`,
    `**الحالة:** ${ticket.status ?? "—"}`,
    `**مقدّم الشكوى:** ${reporter}`,
    ticket.slaDeadline ? `**موعد SLA:** ${ticket.slaDeadline}` : null,
    "",
    "### الوصف",
    ticket.description ?? "—",
    "",
    `🔗 التذكرة في غيث: ${ghaythBaseUrl}/support/${ticket.id}`,
    "",
    "—",
    "_أُنشئ تلقائيًا من نظام غيث للدعم الفني._",
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

/** إنشاء Issue عبر GitHub API. يرمي عند فشل الاستجابة → إعادة/DLQ عبر المُعالِج. */
export async function createGithubIssue(
  repo: string,
  token: string,
  title: string,
  body: string,
  labels: string[],
): Promise<GithubIssue> {
  const res = await fetch(`${GITHUB_API}/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body, labels }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GitHub issue create failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as GithubIssue;
}

/**
 * المُعالِج عبر-المسارات للحدث support.ticket.created: يعكس التذكرة المؤهَّلة
 * (فئتها ضمن المُهيّأة) إلى Issue (تفاصيل كاملة + مقدّم الشكوى + رابط عميق)
 * ويربطه عكسيًا. idempotent (يتخطّى المُزامَن). إخفاقات GitHub لا تعطّل إنشاء
 * التذكرة (إعادة 3× → DLQ).
 */
export async function syncTicketToGithub(payload: EventPayload): Promise<void> {
  const companyId = Number(payload.companyId);
  const ticketId = Number(payload.entityId);
  if (!companyId || !ticketId) return;

  const [ticket] = await rawQuery<SupportTicketRow>(
    `SELECT * FROM support_tickets WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
    [ticketId, companyId],
  );
  if (!ticket) return;
  if (ticket.githubIssueNumber) return; // idempotency: لا تكرار

  const integration = await getActiveIntegration(companyId, "github");
  if (!integration) return; // لا تكامل github لهذه الشركة → تجاهل بهدوء

  const categories = resolveSyncCategories(integration.config);
  if (!shouldSyncCategory(ticket.category, categories)) return; // خارج النطاق المُهيّأ

  const token = String(integration.config.token ?? "");
  const repo = String(integration.config.repo ?? "");
  if (!token || !repo) {
    logger.warn({ companyId }, "[github-sync] تكامل github بلا token/repo — تخطٍّ");
    return;
  }

  let reporter = "—";
  if (ticket.clientId) {
    const [client] = await rawQuery<ClientRow>(
      `SELECT name, phone, email FROM clients WHERE id=$1 AND "companyId"=$2 LIMIT 1`,
      [ticket.clientId, companyId],
    );
    if (client) {
      reporter = [client.name, client.phone, client.email].filter(Boolean).join(" · ") || "—";
    }
  }

  const baseUrl = String(integration.config.ghaythBaseUrl ?? "https://hr.door.sa");
  const issue = await createGithubIssue(
    repo,
    token,
    `[دعم #${ticket.ref ?? ticket.id}] ${ticket.title}`,
    buildIssueBody(ticket, reporter, baseUrl),
    ["support", `priority:${ticket.priority ?? "medium"}`, `category:${ticket.category ?? "—"}`],
  );

  await rawExecute(
    `UPDATE support_tickets SET "githubIssueNumber"=$1, "githubIssueUrl"=$2, "githubSyncedAt"=now() WHERE id=$3 AND "companyId"=$4`,
    [issue.number, issue.html_url, ticket.id, companyId],
  );

  await emitEvent({
    companyId,
    branchId: ticket.branchId ?? undefined,
    userId: null,
    action: "support.ticket.github_synced",
    entity: "support_tickets",
    entityId: ticket.id,
    details: JSON.stringify({ issueNumber: issue.number, issueUrl: issue.html_url }),
  }).catch((e) => logger.error(e, "[github-sync] فشل تسجيل حدث المزامنة"));
}

// تسجيل المُعالِج عند تحميل الوحدة (كنمط hrEngine) — يُستورد من index.ts.
registerCrossDomainHandler("support.ticket.created", syncTicketToGithub);
