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
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  signOauthState,
  verifyOauthState,
} from "../lib/microsoftOauth.js";

const router = Router();

type MailboxRow = {
  id: number;
  companyId: number;
  userId: number;
  provider: string;
  displayName: string | null;
  emailAddress: string;
  branchId: number | null;
  branchName?: string | null;
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
  id, "companyId", "userId", "branchId", provider, "displayName", "emailAddress",
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
    // Personal mailboxes (mine) + any branch-scoped shared mailbox in my
    // company. Branch-shared rows (branchId IS NOT NULL) are visible to the
    // whole company team, not just the user who connected them.
    const rows = await rawQuery<MailboxRow>(
      `SELECT ${PUBLIC_COLUMNS}
         FROM mailbox_accounts
        WHERE "companyId" = $1 AND "deletedAt" IS NULL
          AND ("userId" = $2 OR "branchId" IS NOT NULL)
        ORDER BY "createdAt" ASC`,
      [scope.companyId, scope.userId]
    );
    const branchIds = [
      ...new Set(rows.map((r) => r.branchId).filter((x): x is number => x != null)),
    ];
    if (branchIds.length > 0) {
      const branches = await rawQuery<{ id: number; name: string }>(
        `SELECT id, name FROM branches WHERE id = ANY($1) AND "companyId" = $2`,
        [branchIds, scope.companyId]
      );
      const nameById = new Map(branches.map((b) => [b.id, b.name]));
      for (const r of rows) {
        r.branchName = r.branchId != null ? nameById.get(r.branchId) ?? null : null;
      }
    }
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
      provider, displayName, emailAddress, branchId,
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
    // Optional branch scoping — must reference a branch in the caller's company.
    let resolvedBranchId: number | null = null;
    if (branchId != null && branchId !== "") {
      const [branch] = await rawQuery<{ id: number }>(
        `SELECT id FROM branches WHERE id = $1 AND "companyId" = $2`,
        [Number(branchId), scope.companyId]
      );
      if (!branch) throw new ValidationError("الفرع غير موجود ضمن شركتك");
      resolvedBranchId = branch.id;
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
          "syncFolders", "branchId", "syncEnabled", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9, $10,$11,$12,$13, $14,$15,$16,$17,
               $18, $19, true, NOW(), NOW())`,
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
        resolvedBranchId,
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

// ─────────────────────── Microsoft 365 OAuth flow ────────────────────────
// Two-step browser flow replacing the manual token paste in the
// connect dialog. The frontend opens GET /authorize → redirects user
// to Microsoft → Microsoft redirects back to GET /callback with `code`.

// 302 redirect to Microsoft's authorize endpoint. The browser navigates
// here from the connect dialog; we mint a signed state token and
// redirect. Returning JSON would have forced the frontend to do a
// two-step (fetch then navigate), which the dialog UX doesn't need.
router.get("/oauth/microsoft365/authorize", authorize({ feature: "communications", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const state = signOauthState(scope.userId, scope.companyId);
    const url = buildAuthorizeUrl(state);
    if (!url) {
      throw new ValidationError(
        "Microsoft 365 OAuth غير مفعّل",
        { fix: "ضع MICROSOFT365_CLIENT_ID + MICROSOFT365_CLIENT_SECRET + MICROSOFT365_REDIRECT_URI أو حدّث vendor_secrets.microsoft365" },
      );
    }
    res.redirect(url);
  } catch (err) {
    handleRouteError(err, res, "mailboxes/oauth/authorize");
  }
});

// Microsoft redirects back here. We can't require an authMiddleware
// session because the user could have lost their session during the
// browser bounce — instead we rely on the signed `state` token that
// only the originally-authenticated user could have minted (10-min
// TTL, HMAC-signed with JWT_SECRET).
//
// NOTE: this endpoint is unauthenticated. It MUST NOT trust any field
// other than state for the identity binding. The `code` is exchanged
// with Microsoft, the resulting tokens get stored against the userId
// the state was minted for, period.
router.get("/oauth/microsoft365/callback", async (req, res) => {
  try {
    const { code, state, error: oauthErr } = req.query as Record<string, string | undefined>;
    if (oauthErr) {
      logger.warn({ oauthErr }, "[m365 oauth] user denied authorization");
      res.redirect("/mailboxes?m365_error=denied");
      return;
    }
    if (!code || !state) {
      res.redirect("/mailboxes?m365_error=missing_code_or_state");
      return;
    }
    const verified = verifyOauthState(state);
    if (!verified) {
      logger.warn("[m365 oauth] state verification failed — possible CSRF or expired");
      res.redirect("/mailboxes?m365_error=invalid_state");
      return;
    }
    const tokens = await exchangeCodeForTokens(code).catch((err) => {
      logger.error(err, "[m365 oauth] code exchange failed");
      return null;
    });
    if (!tokens) {
      res.redirect("/mailboxes?m365_error=token_exchange_failed");
      return;
    }
    if (!tokens.email) {
      res.redirect("/mailboxes?m365_error=no_email_in_token");
      return;
    }

    // Upsert: if the user already connected this mailbox, refresh the
    // tokens in place. Otherwise insert a new row.
    const [existing] = await rawQuery<{ id: number }>(
      `SELECT id FROM mailbox_accounts
        WHERE "companyId" = $1 AND "userId" = $2 AND "emailAddress" = $3 AND "deletedAt" IS NULL`,
      [verified.companyId, verified.userId, tokens.email],
    );

    if (existing) {
      await rawExecute(
        `UPDATE mailbox_accounts
            SET "accessToken" = $1, "refreshToken" = $2, "tokenExpiresAt" = $3,
                "lastSyncStatus" = NULL, "lastSyncError" = NULL,
                "updatedAt" = NOW()
          WHERE id = $4`,
        [
          encryptSecret(tokens.accessToken),
          encryptSecret(tokens.refreshToken),
          tokens.expiresAt.toISOString(),
          existing.id,
        ],
      );
      res.redirect(`/mailboxes?m365_connected=${encodeURIComponent(tokens.email)}&reused=1`);
      return;
    }

    const { insertId } = await rawExecute(
      `INSERT INTO mailbox_accounts
         ("companyId", "userId", provider, "emailAddress",
          "accessToken", "refreshToken", "tokenExpiresAt",
          "syncEnabled", "createdAt", "updatedAt")
       VALUES ($1, $2, 'microsoft365', $3, $4, $5, $6, true, NOW(), NOW())`,
      [
        verified.companyId, verified.userId, tokens.email,
        encryptSecret(tokens.accessToken),
        encryptSecret(tokens.refreshToken),
        tokens.expiresAt.toISOString(),
      ],
    );
    assertInsert(insertId, "mailbox_accounts");

    void emitEvent({
      companyId: verified.companyId,
      userId: verified.userId,
      action: "mailbox.connected",
      entity: "mailbox_accounts",
      entityId: insertId,
      details: JSON.stringify({ provider: "microsoft365", emailAddress: tokens.email, via: "oauth" }),
    }).catch((e) => logger.warn(e, "[event] mailbox.connected oauth"));

    void createAuditLog({
      companyId: verified.companyId,
      userId: verified.userId,
      action: "create",
      entity: "mailbox_accounts",
      entityId: insertId,
      after: { provider: "microsoft365", emailAddress: tokens.email, via: "oauth" },
    }).catch((e) => logger.warn(e, "[audit] mailbox.connected oauth"));

    res.redirect(`/mailboxes?m365_connected=${encodeURIComponent(tokens.email)}`);
  } catch (err) {
    logger.error(err, "[m365 oauth] callback failed");
    res.redirect("/mailboxes?m365_error=internal");
  }
});

export default router;
