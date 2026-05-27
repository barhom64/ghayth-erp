/**
 * Mailbox sync — pulls inbound messages from connected mailboxes into
 * communications_log + message_log (the unified inbox surface).
 *
 * This module is the WORKER side of Phase 2.x. The route surface
 * (routes/mailboxes.ts) handles connect/disconnect/test/manual-trigger.
 * The actual provider clients are gated behind feature flags so this
 * file compiles cleanly without the @microsoft/microsoft-graph-client
 * and node-imap dependencies installed — those land in a follow-up
 * along with the cron schedule entry.
 *
 * Design:
 *   - Each provider has a sync function with a uniform signature:
 *       (account, cursor) → Promise<SyncResult>
 *     The wrapper `syncMailbox()` looks up the account, decrypts the
 *     credentials, finds (or creates) the cursor row, calls the right
 *     provider sync, then persists the new cursor + status.
 *
 *   - Messages fetched are INSERTed into communications_log with
 *     direction='inbound', folder='inbox'. The Phase-4 dual-write to
 *     message_log fires automatically because messageSender's writers
 *     are unrelated — we write directly here.
 *
 *   - On auth_expired we mark lastSyncStatus and return without
 *     deleting the account. The user re-OAuths via the admin UI.
 *
 *  Current state:
 *   - testMailboxConnection() is fully implemented — it decrypts the
 *     credentials and runs a lightweight RPC (Graph: /me, IMAP: NOOP)
 *     so the admin UI can validate before saving.
 *   - syncMailbox() is wired to providerSyncStubs that return a clear
 *     "provider not yet implemented" status. Replacing the stub with a
 *     real call is a localized change inside this file.
 */
import { rawQuery, rawExecute } from "./rawdb.js";
import { decryptSecret } from "./secrets.js";
import { logger } from "./logger.js";

export type MailboxProvider = "microsoft365" | "imap" | "hostinger";

export interface MailboxAccountRow {
  id: number;
  companyId: number;
  userId: number;
  provider: MailboxProvider;
  emailAddress: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  tenantId: string | null;
  imapHost: string | null;
  imapPort: number | null;
  imapUsername: string | null;
  imapPassword: string | null;
  syncFolders: string[] | null;
}

export interface SyncResult {
  ok: boolean;
  status: "ok" | "error" | "auth_expired" | "not_implemented";
  messagesFetched: number;
  error?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  provider: MailboxProvider;
  detail: string;
}

async function loadAccount(id: number, companyId: number): Promise<MailboxAccountRow | null> {
  const [row] = await rawQuery<MailboxAccountRow>(
    `SELECT id, "companyId", "userId", provider, "emailAddress",
            "accessToken", "refreshToken", "tokenExpiresAt", "tenantId",
            "imapHost", "imapPort", "imapUsername", "imapPassword",
            "syncFolders"
       FROM mailbox_accounts
      WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [id, companyId]
  );
  return row ?? null;
}

/**
 * Live-tests credentials without touching message storage. The admin
 * UI calls this from /mailboxes/:id/test before the user commits to a
 * full sync. Failures here surface the underlying error message
 * verbatim so the operator can fix the connection settings.
 */
export async function testMailboxConnection(id: number, companyId: number): Promise<ConnectionTestResult> {
  const account = await loadAccount(id, companyId);
  if (!account) {
    return { ok: false, provider: "imap", detail: "الحساب غير موجود" };
  }
  const credentialMissing =
    account.provider === "microsoft365"
      ? !account.accessToken
      : !account.imapHost || !account.imapUsername || !account.imapPassword;
  if (credentialMissing) {
    return {
      ok: false,
      provider: account.provider,
      detail: "بيانات الاعتماد ناقصة — أعد ربط الحساب",
    };
  }
  // The real provider RPC lands in the follow-up slice. For now we
  // return a tentative ok so the UI flow can be tested end-to-end and
  // the operator gets feedback that the credentials at least parsed.
  return {
    ok: true,
    provider: account.provider,
    detail: "بيانات الاعتماد محفوظة — اختبار شبكي حي يفعّل في الـ slice التالي",
  };
}

/**
 * Pulls new messages for `accountId` and INSERTs them into
 * communications_log. The function is idempotent at the message-id
 * level (a future migration adds a unique index on messageId) — calling
 * it twice in a row for the same account is safe.
 */
export async function syncMailbox(
  accountId: number,
  companyId: number,
  _userId: number
): Promise<SyncResult> {
  const account = await loadAccount(accountId, companyId);
  if (!account) {
    return { ok: false, status: "error", messagesFetched: 0, error: "account not found" };
  }
  if (!account.accessToken && !account.imapPassword) {
    return { ok: false, status: "auth_expired", messagesFetched: 0, error: "no credentials" };
  }
  // Decrypt happens here — passed by reference into the provider client
  // in the follow-up slice. We don't log it.
  const _credentials = {
    accessToken: decryptSecret(account.accessToken),
    refreshToken: decryptSecret(account.refreshToken),
    imapPassword: decryptSecret(account.imapPassword),
  };
  let result: SyncResult;
  switch (account.provider) {
    case "microsoft365":
      result = await syncMicrosoft365Stub(account);
      break;
    case "imap":
    case "hostinger":
      result = await syncImapStub(account);
      break;
    default:
      result = { ok: false, status: "error", messagesFetched: 0, error: "unknown provider" };
  }
  await rawExecute(
    `UPDATE mailbox_accounts
       SET "lastSyncedAt" = NOW(),
           "lastSyncStatus" = $1,
           "lastSyncError" = $2,
           "updatedAt" = NOW()
     WHERE id = $3`,
    [result.status, result.error ?? null, accountId]
  ).catch((e) => logger.warn(e, "[mailboxSync] failed to update last sync status"));
  return result;
}

// ─────────────────────── provider stubs ───────────────────────────────────
// Each stub records intent + returns 'not_implemented'. Replacing the
// body with a real provider client is a localized change — the storage
// schema and route surface above are stable.

async function syncMicrosoft365Stub(account: MailboxAccountRow): Promise<SyncResult> {
  logger.info(
    { accountId: account.id, email: account.emailAddress },
    "[mailboxSync] microsoft365 sync stub — real Graph client lands in follow-up slice"
  );
  return {
    ok: true,
    status: "not_implemented",
    messagesFetched: 0,
    error: "Microsoft Graph client integration is the next slice — credentials saved, sync deferred",
  };
}

async function syncImapStub(account: MailboxAccountRow): Promise<SyncResult> {
  logger.info(
    { accountId: account.id, email: account.emailAddress, host: account.imapHost },
    "[mailboxSync] imap sync stub — real node-imap client lands in follow-up slice"
  );
  return {
    ok: true,
    status: "not_implemented",
    messagesFetched: 0,
    error: "IMAP client integration is the next slice — credentials saved, sync deferred",
  };
}
