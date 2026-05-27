/**
 * Mailbox accounts — connect Microsoft 365 / Hostinger / generic IMAP.
 *
 * Phase 2.x of communications unification (see
 * docs/architecture/communications-unification.md). This file is the
 * STORAGE + management surface. The actual IMAP / Microsoft Graph
 * network sync lives in lib/mailboxSync.ts and is driven by a cron
 * worker (a follow-up slice — for now the worker entry is a stub that
 * documents what each provider needs).
 *
 * Endpoints:
 *   GET    /mailboxes              — list my connected mailboxes
 *   POST   /mailboxes              — connect a new one (any provider)
 *   PATCH  /mailboxes/:id          — update sync settings or rotate creds
 *   DELETE /mailboxes/:id          — soft-delete (sync stops)
 *   POST   /mailboxes/:id/sync     — manual trigger (returns sync result)
 *   POST   /mailboxes/:id/test     — verify connection without saving messages
 *
 * Token storage: OAuth + IMAP passwords are encrypted at rest via
 * secrets.encryptSecret() before insert, and decrypted only inside
 * lib/mailboxSync.ts where they're handed to the provider client.
 * Nothing else in the API ever sees the plaintext credential.
 */
import { Router } from "express";
import { rawQuery, rawExecute, assertInsert } from "../lib/rawdb.js";
import { handleRouteError, ValidationError, NotFoundError } from "../lib/errorHandler.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { encryptSecret } from "../lib/secrets.js";
import { emitEvent, createAuditLog } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { syncMailbox, testMailboxConnection } from "../lib/mailboxSync.js";

const router = Router();

type MailboxRow = {
  id: number;
  companyId: number;
  userId: number;
  provider: string;
  displayName: string | null;
  emailAddress: string;
  tenantId: string | null;
  imapHost: string | null;
  imapPort: number | null;
  imapUsername: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  syncEnabled: boolean;
  syncFolders: string[] | null;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
};

// Never return token/password columns even masked. Callers don't need
// them and we don't want them in audit log payloads either.
const PUBLIC_COLUMNS = `
  id, "companyId", "userId", provider, "displayName", "emailAddress",
  "tenantId", "imapHost", "imapPort", "imapUsername",
  "smtpHost", "smtpPort", "smtpUsername",
  "syncEnabled", "syncFolders",
  "lastSyncedAt", "lastSyncStatus", "lastSyncError",
  "createdAt", "updatedAt"
`;

// ─────────────────────── GET /mailboxes ───────────────────────────────────
router.get("/", authorize({ feature: "communications", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<MailboxRow>(
      `SELECT ${PUBLIC_COLUMNS}
         FROM mailbox_accounts
        WHERE "companyId" = $1 AND "userId" = $2 AND "deletedAt" IS NULL
        ORDER BY "createdAt" ASC`,
      [scope.companyId, scope.userId]
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "mailboxes/list");
  }
});

// ─────────────────────── POST /mailboxes ──────────────────────────────────
router.post("/", authorize({ feature: "communications", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const {
      provider, displayName, emailAddress,
      // microsoft365
      accessToken, refreshToken, tokenExpiresAt, tenantId,
      // imap/hostinger
      imapHost, imapPort, imapUsername, imapPassword,
      smtpHost, smtpPort, smtpUsername, smtpPassword,
      syncFolders,
    } = req.body ?? {};

    if (!["microsoft365", "imap", "hostinger"].includes(provider)) {
      throw new ValidationError("provider غير مدعوم");
    }
    if (!emailAddress || typeof emailAddress !== "string") {
      throw new ValidationError("emailAddress مطلوب");
    }
    if (provider === "microsoft365" && (!accessToken || !refreshToken)) {
      throw new ValidationError("accessToken و refreshToken مطلوبان لمزود Microsoft 365");
    }
    if ((provider === "imap" || provider === "hostinger") && (!imapHost || !imapUsername || !imapPassword)) {
      throw new ValidationError("imapHost و imapUsername و imapPassword مطلوبة لمزود IMAP");
    }

    const { insertId } = await rawExecute(
      `INSERT INTO mailbox_accounts
         ("companyId", "userId", provider, "displayName", "emailAddress",
          "accessToken", "refreshToken", "tokenExpiresAt", "tenantId",
          "imapHost", "imapPort", "imapUsername", "imapPassword",
          "smtpHost", "smtpPort", "smtpUsername", "smtpPassword",
          "syncFolders", "syncEnabled", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9, $10,$11,$12,$13, $14,$15,$16,$17,
               $18, true, NOW(), NOW())`,
      [
        scope.companyId, scope.userId, provider, displayName ?? null, emailAddress,
        accessToken ? encryptSecret(accessToken) : null,
        refreshToken ? encryptSecret(refreshToken) : null,
        tokenExpiresAt ?? null, tenantId ?? null,
        imapHost ?? null, imapPort ?? null, imapUsername ?? null,
        imapPassword ? encryptSecret(imapPassword) : null,
        smtpHost ?? null, smtpPort ?? null, smtpUsername ?? null,
        smtpPassword ? encryptSecret(smtpPassword) : null,
        Array.isArray(syncFolders) ? syncFolders : null,
      ]
    );
    assertInsert(insertId, "mailbox_accounts");

    void emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "mailbox.connected",
      entity: "mailbox_accounts",
      entityId: insertId,
      details: JSON.stringify({ provider, emailAddress }),
    }).catch((e) => logger.warn(e, "[event] mailbox.connected"));

    void createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "create",
      entity: "mailbox_accounts",
      entityId: insertId,
      after: { provider, emailAddress, displayName },
    }).catch((e) => logger.warn(e, "[audit] mailbox.connected"));

    const [row] = await rawQuery<MailboxRow>(
      `SELECT ${PUBLIC_COLUMNS} FROM mailbox_accounts WHERE id = $1`,
      [insertId]
    );
    res.status(201).json(maskFields(req, { data: row }));
  } catch (err) {
    handleRouteError(err, res, "mailboxes/create");
  }
});

// ─────────────────────── PATCH /mailboxes/:id ─────────────────────────────
router.patch("/:id", authorize({ feature: "communications", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<MailboxRow>(
      `SELECT id, "userId" FROM mailbox_accounts
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("mailbox_account");
    if (existing.userId !== scope.userId && !scope.isOwner) {
      throw new ValidationError("ليس لديك صلاحية تعديل هذا الصندوق");
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    const b = req.body ?? {};
    const push = (col: string, val: unknown, encrypt = false) => {
      params.push(encrypt && typeof val === "string" ? encryptSecret(val) : val);
      updates.push(`"${col}" = $${params.length}`);
    };

    if (b.displayName !== undefined) push("displayName", b.displayName);
    if (b.syncEnabled !== undefined) push("syncEnabled", Boolean(b.syncEnabled));
    if (b.syncFolders !== undefined) push("syncFolders", Array.isArray(b.syncFolders) ? b.syncFolders : null);
    // Token rotation — allow updating the encrypted fields directly.
    if (b.accessToken) push("accessToken", b.accessToken, true);
    if (b.refreshToken) push("refreshToken", b.refreshToken, true);
    if (b.tokenExpiresAt !== undefined) push("tokenExpiresAt", b.tokenExpiresAt);
    if (b.imapPassword) push("imapPassword", b.imapPassword, true);
    if (b.smtpPassword) push("smtpPassword", b.smtpPassword, true);

    if (updates.length === 0) {
      throw new ValidationError("لا توجد تغييرات للحفظ");
    }
    updates.push(`"updatedAt" = NOW()`);
    params.push(id);
    await rawExecute(
      `UPDATE mailbox_accounts SET ${updates.join(", ")} WHERE id = $${params.length}`,
      params
    );

    void createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "update",
      entity: "mailbox_accounts",
      entityId: id,
      after: { fields: Object.keys(b).filter((k) => !["accessToken","refreshToken","imapPassword","smtpPassword"].includes(k)) },
    }).catch((e) => logger.warn(e, "[audit] mailbox.update"));

    const [row] = await rawQuery<MailboxRow>(
      `SELECT ${PUBLIC_COLUMNS} FROM mailbox_accounts WHERE id = $1`,
      [id]
    );
    res.json(maskFields(req, { data: row }));
  } catch (err) {
    handleRouteError(err, res, "mailboxes/update");
  }
});

// ─────────────────────── DELETE /mailboxes/:id ────────────────────────────
router.delete("/:id", authorize({ feature: "communications", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<MailboxRow>(
      `SELECT id, "userId", "emailAddress" FROM mailbox_accounts
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("mailbox_account");
    if (existing.userId !== scope.userId && !scope.isOwner) {
      throw new ValidationError("ليس لديك صلاحية حذف هذا الصندوق");
    }
    await rawExecute(
      `UPDATE mailbox_accounts SET "deletedAt" = NOW(), "syncEnabled" = false WHERE id = $1`,
      [id]
    );

    void emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "mailbox.disconnected",
      entity: "mailbox_accounts",
      entityId: id,
      details: JSON.stringify({ emailAddress: existing.emailAddress }),
    }).catch((e) => logger.warn(e, "[event] mailbox.disconnected"));

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "mailboxes/delete");
  }
});

// ─────────────────────── POST /mailboxes/:id/sync (manual) ────────────────
router.post("/:id/sync", authorize({ feature: "communications", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const result = await syncMailbox(id, scope.companyId, scope.userId);
    res.json(maskFields(req, { data: result }));
  } catch (err) {
    handleRouteError(err, res, "mailboxes/sync");
  }
});

// ─────────────────────── POST /mailboxes/:id/test ────────────────────────
router.post("/:id/test", authorize({ feature: "communications", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const result = await testMailboxConnection(id, scope.companyId);
    res.json(maskFields(req, { data: result }));
  } catch (err) {
    handleRouteError(err, res, "mailboxes/test");
  }
});

export default router;
