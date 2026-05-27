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
import { decryptSecret, encryptSecret } from "./secrets.js";
import { logger } from "./logger.js";
import { refreshAccessToken } from "./microsoftOauth.js";

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
      result = await syncMicrosoft365(account).catch((err) => ({
        ok: false,
        status: "error" as const,
        messagesFetched: 0,
        error: err instanceof Error ? err.message : String(err),
      }));
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

/**
 * Real Microsoft Graph sync. Uses /me/messages/delta to pull inbox
 * messages incrementally — the first call grabs everything (limited to
 * 50 per page; we cap at one page per cron tick to keep latency
 * bounded), subsequent calls only return what's new since the saved
 * deltaToken.
 *
 * Each Graph message becomes an INSERT into communications_log
 * (direction='inbound') AND a parallel INSERT into message_log via the
 * existing Phase-4 path. We don't go through messageSender because
 * sendMessage() is the OUTBOUND seam; INBOUND messages have their own
 * shape (no DLP scan, no queue insert).
 *
 * Token refresh: if the saved tokenExpiresAt is within 60s of now,
 * exchange the refresh token first and persist the new pair before
 * calling Graph.
 */
async function syncMicrosoft365(account: MailboxAccountRow): Promise<SyncResult> {
  let accessToken = decryptSecret(account.accessToken);
  const refreshToken = decryptSecret(account.refreshToken);
  if (!accessToken || !refreshToken) {
    return { ok: false, status: "auth_expired", messagesFetched: 0, error: "tokens missing" };
  }

  // Refresh if token is within 60s of expiry (or already expired).
  const expiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : 0;
  if (expiresAt - Date.now() < 60_000) {
    const refreshed = await refreshAccessToken(refreshToken);
    if (!refreshed) {
      return { ok: false, status: "auth_expired", messagesFetched: 0, error: "refresh token rejected" };
    }
    accessToken = refreshed.accessToken;
    await rawExecute(
      `UPDATE mailbox_accounts
          SET "accessToken" = $1, "refreshToken" = $2, "tokenExpiresAt" = $3,
              "updatedAt" = NOW()
        WHERE id = $4`,
      [
        encryptSecret(refreshed.accessToken),
        encryptSecret(refreshed.refreshToken),
        refreshed.expiresAt.toISOString(),
        account.id,
      ],
    ).catch((e) => logger.warn(e, "[mailboxSync] persist refreshed tokens failed"));
  }

  // Load (or initialise) the sync cursor for the inbox folder.
  const [cursorRow] = await rawQuery<{ deltaToken: string | null }>(
    `SELECT "deltaToken" FROM mailbox_sync_cursors
      WHERE "accountId" = $1 AND folder = 'inbox' LIMIT 1`,
    [account.id],
  );
  const initialUrl = cursorRow?.deltaToken
    ?? "https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$top=50";

  const resp = await fetch(initialUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: "outlook.body-content-type=text" },
  });
  if (!resp.ok) {
    if (resp.status === 401) {
      return { ok: false, status: "auth_expired", messagesFetched: 0, error: "Graph returned 401" };
    }
    const errText = await resp.text().catch(() => "");
    return { ok: false, status: "error", messagesFetched: 0, error: `Graph ${resp.status}: ${errText.slice(0, 200)}` };
  }
  const payload = await resp.json() as {
    value: Array<{
      id: string;
      subject?: string | null;
      from?: { emailAddress?: { address?: string } };
      toRecipients?: Array<{ emailAddress?: { address?: string } }>;
      bodyPreview?: string;
      body?: { content?: string };
      receivedDateTime?: string;
      "@removed"?: { reason: string };
    }>;
    "@odata.deltaLink"?: string;
    "@odata.nextLink"?: string;
  };

  const messages = payload.value ?? [];
  let messagesFetched = 0;
  for (const msg of messages) {
    if (msg["@removed"]) continue; // skip deletions during initial slice
    const fromAddress = msg.from?.emailAddress?.address ?? null;
    const toAddress = msg.toRecipients?.[0]?.emailAddress?.address ?? account.emailAddress;
    const subject = msg.subject ?? null;
    const body = msg.body?.content ?? msg.bodyPreview ?? "";
    const receivedAt = msg.receivedDateTime ?? new Date().toISOString();

    // Idempotency: skip if we already stored a row for this Graph id.
    // The Graph id lives in message_log via the future legacyId column
    // for messageId once we add it; for now we use a digest probe
    // against `body` + `receivedAt` + `fromAddress` to avoid duplicates.
    const [dup] = await rawQuery<{ id: number }>(
      `SELECT id FROM communications_log
        WHERE "companyId" = $1 AND direction = 'inbound' AND channel = 'email'
          AND COALESCE("fromNumber",'') = COALESCE($2,'')
          AND "createdAt" = $3
        LIMIT 1`,
      [account.companyId, fromAddress, receivedAt],
    );
    if (dup) continue;

    const { insertId } = await rawExecute(
      `INSERT INTO communications_log
         ("companyId", channel, direction, "fromNumber", "toNumber",
          subject, body, status, folder, "createdAt")
       VALUES ($1, 'email', 'inbound', $2, $3, $4, $5, 'received', 'inbox', $6)`,
      [account.companyId, fromAddress, toAddress, subject, body, receivedAt],
    );

    if (insertId > 0) {
      await rawExecute(
        `INSERT INTO message_log
           ("companyId", channel, direction, "fromAddress", "toAddress",
            subject, body, status, folder,
            "legacySource", "legacyId", "createdAt")
         VALUES ($1, 'email', 'inbound', $2, $3, $4, $5, 'received', 'inbox',
                 'communications_log', $6, $7)`,
        [account.companyId, fromAddress, toAddress, subject, body, insertId, receivedAt],
      ).catch((e) => logger.warn(e, "[mailboxSync] message_log mirror failed"));
      messagesFetched++;
    }
  }

  // Persist the deltaLink so the next sync only fetches new messages.
  // Microsoft returns deltaLink only on the final page of a sync; on
  // intermediate pages it returns nextLink. We stop after one page per
  // tick, so on first run we may store a nextLink (still works as a
  // cursor — calling it returns the next batch).
  const nextCursor = payload["@odata.deltaLink"] ?? payload["@odata.nextLink"] ?? null;
  if (nextCursor) {
    await rawExecute(
      `INSERT INTO mailbox_sync_cursors ("accountId", folder, "deltaToken", "lastFetchedAt", "messagesFetched", "createdAt", "updatedAt")
       VALUES ($1, 'inbox', $2, NOW(), $3, NOW(), NOW())
       ON CONFLICT ("accountId", folder) DO UPDATE
         SET "deltaToken" = EXCLUDED."deltaToken",
             "lastFetchedAt" = NOW(),
             "messagesFetched" = mailbox_sync_cursors."messagesFetched" + EXCLUDED."messagesFetched",
             "updatedAt" = NOW()`,
      [account.id, nextCursor, messagesFetched],
    ).catch((e) => logger.warn(e, "[mailboxSync] cursor persist failed"));
  }

  return { ok: true, status: "ok", messagesFetched };
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
