# Secrets rotation procedures

> When to rotate, how to rotate without data loss, how to verify.
>
> All four production secrets (`JWT_SECRET`, `FIELD_ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY`, `ADMIN_PASSWORD`) have different rotation profiles. Read each section before acting — `FIELD_ENCRYPTION_KEY` rotated incorrectly **destroys data**.

## When to rotate

| Trigger | Rotate within |
| --- | --- |
| Credential leaked / suspected leak | Immediately, before anything else |
| Personnel with access leaves | Same day |
| Quarterly compliance | 90 days |
| `JWT_SECRET` shared with dev / staging | At the next deploy |
| Major release / major dependency upgrade | At the deploy if reasonable |

## 1. `JWT_SECRET` — safest to rotate

`JWT_SECRET` signs short-lived access tokens (15 min TTL) and refresh tokens (7 days TTL). Rotating invalidates every issued token — users have to log in again, but no data is lost.

```bash
# 1. Generate a new secret.
NEW=$(openssl rand -hex 32)

# 2. Update the env on every replica:
echo "JWT_SECRET=$NEW" >> .env   # or set in your secret manager

# 3. Restart every API instance. Sequential restarts cause some users
#    to see a single 401 — they re-login and it's fine. Match across
#    replicas before flipping or load-balanced traffic will see random
#    "invalid token" 401s.

# 4. Verify: log in fresh, check the JWT decodes with the new secret.
```

**Multi-instance**: roll all replicas in the same minute. The brief window where some replicas have the old secret and some have the new is when users see intermittent 401s.

## 2. `FIELD_ENCRYPTION_KEY` — **destructive if rotated in place**

`FIELD_ENCRYPTION_KEY` encrypts PII columns (national IDs, passport numbers, banking details, ZATCA private keys). Encrypted rows are tagged with which key encrypted them so the application can decrypt mixed-key rows during rotation.

**Wrong way (data loss):**

```bash
# DO NOT do this — every PII row written before the change becomes
# unreadable.
echo "FIELD_ENCRYPTION_KEY=$(openssl rand -hex 32)" > .env
systemctl restart ghayth-api
```

**Right way (two-key window):**

```bash
# 1. Generate the new key.
NEW=$(openssl rand -hex 32)

# 2. Set BOTH keys. The new one is used for writes; the old one is
#    kept for reads.
FIELD_ENCRYPTION_KEY=$NEW
FIELD_ENCRYPTION_KEY_PREVIOUS=<the old value>

# 3. Deploy. All new writes are encrypted with $NEW; all reads try
#    $NEW first and fall back to FIELD_ENCRYPTION_KEY_PREVIOUS.

# 4. Run the bulk re-encrypt job. The job walks every encrypted
#    column, decrypts with whichever key works, re-encrypts with $NEW,
#    updates the row in batches:
pnpm --filter @workspace/api-server run reencrypt-pii

# 5. After the job completes, drop FIELD_ENCRYPTION_KEY_PREVIOUS from
#    the env and restart. Verify by reading a sample PII row: it
#    should decrypt cleanly with $NEW alone.
```

If the rotation job fails midway: re-run it. It's idempotent — already-re-encrypted rows are skipped.

If you lose the old key **before** running the rotation: every PII row written before this point is permanently unreadable. Restore from a backup that predates the loss, or accept the data loss.

## 3. `SECRETS_ENCRYPTION_KEY` — same shape, smaller blast radius

`SECRETS_ENCRYPTION_KEY` encrypts the `secrets_vault` table (stored integration credentials: WhatsApp tokens, Mudad creds, AI keys, ZATCA private keys). Lose this key and every stored integration credential is gone — but you can re-configure each integration from its source-of-truth dashboard.

The rotation procedure mirrors `FIELD_ENCRYPTION_KEY`:

```bash
# Two-key window, then bulk re-encrypt:
SECRETS_ENCRYPTION_KEY=<new>
SECRETS_ENCRYPTION_KEY_PREVIOUS=<old>
# Deploy. Run:
pnpm --filter @workspace/api-server run reencrypt-vault
# Then drop _PREVIOUS and redeploy.
```

## 4. `ADMIN_PASSWORD` for the bootstrap admin

The bootstrap admin is created on first boot from `ADMIN_EMAIL`/`ADMIN_PASSWORD`. After that, the env vars are unused — the password lives in the `users` table. To rotate:

```bash
# Option A — via the admin UI (recommended): log in as the admin,
# Settings → My account → Change password.

# Option B — emergency reset from the DB:
psql "$DATABASE_URL"
> UPDATE users
>    SET "passwordHash" = '$2b$10$<new-bcrypt-hash>'
>  WHERE email = 'ops@example.com';
# Generate the bcrypt hash with: pnpm --filter @workspace/api-server run hash-password '<plain>'
```

Do **not** edit `ADMIN_PASSWORD` in `.env` and restart expecting that to change the live password — the env var is only consulted when the users table is empty.

## Verification checklist

After any rotation:

```bash
# 1. Liveness still 200
curl -sf https://api.example.com/api/health

# 2. Login works
curl -sf -X POST https://api.example.com/api/auth/login \
  -d '{"email":"...","password":"..."}' | jq -e '.accessToken'

# 3. (FIELD_ENCRYPTION_KEY only) read a PII row through the API
#    and verify the decrypted value matches what you expect:
curl -sf -H "Authorization: Bearer <token>" \
  https://api.example.com/api/employees/1 | jq '.nationalId'

# 4. Audit log entry for the rotation event
psql "$DATABASE_URL" -c \
  "SELECT id, action, \"createdAt\" FROM audit_logs WHERE action LIKE 'secret.%' ORDER BY id DESC LIMIT 5;"
```

## What to do if a secret leaks

1. **Rotate the leaked secret first**, even before investigating — the new value invalidates the leaked one.
2. Force re-login for all users: invalidate the `refresh_tokens` table.
   ```sql
   UPDATE refresh_tokens SET "revokedAt" = NOW() WHERE "revokedAt" IS NULL;
   ```
3. Audit the access logs for the window the leaked secret was valid. The `audit_logs` table records every privileged action.
4. If `FIELD_ENCRYPTION_KEY` leaked, the attacker can decrypt **every** PII row they exfiltrate. Treat as a personal-data breach and follow PDPL notification rules.
5. Update the secret in every environment that shared it.
