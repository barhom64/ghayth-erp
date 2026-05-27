/**
 * Microsoft 365 OAuth — authorize URL builder + code-for-token exchange.
 *
 * Replaces the manual access/refresh token paste in /mailboxes. Users
 * click "Sign in with Microsoft", grant permission, Microsoft redirects
 * back with `code`, the callback exchanges it for tokens, and stores
 * them encrypted in mailbox_accounts.
 *
 * Setup: operator creates an Azure AD app registration at
 * https://portal.azure.com → App registrations → New registration.
 * Required permissions (delegated):
 *   - offline_access  (refresh tokens)
 *   - Mail.Read       (read inbox)
 *   - Mail.Send       (send via Graph)
 *   - User.Read       (caller email address)
 * Redirect URI: {PUBLIC_APP_URL}/api/mailboxes/oauth/microsoft365/callback
 *
 * Credentials live in MICROSOFT365_CLIENT_ID + MICROSOFT365_CLIENT_SECRET
 * env vars or vendor_secrets.microsoft365 row.
 *
 * State token: signed HMAC over `userId.companyId.nonce.timestamp` with
 * JWT_SECRET so a CSRF attacker can't trick the callback into linking
 * someone else's mailbox to their account. Expires after 10 minutes.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { getCachedVendorConfigSync } from "./vendorSettings.js";
import { logger } from "./logger.js";

const M365_AUTHORIZE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const M365_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const SCOPES = ["offline_access", "Mail.Read", "Mail.Send", "User.Read"];

export interface MicrosoftConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function getMicrosoftConfig(): MicrosoftConfig {
  const vc = getCachedVendorConfigSync("microsoft365");
  return {
    clientId: String(vc.config.clientId ?? config.microsoft365.clientId ?? ""),
    clientSecret: String(vc.config.clientSecret ?? config.microsoft365.clientSecret ?? ""),
    redirectUri: String(vc.config.redirectUri ?? config.microsoft365.redirectUri ?? ""),
  };
}

/**
 * Builds a state token that ties the OAuth callback to the user who
 * initiated the flow. Without this, an attacker could intercept the
 * authorize redirect and bind their mailbox to a victim's account.
 */
export function signOauthState(userId: number, companyId: number): string {
  const nonce = randomBytes(8).toString("hex");
  const ts = Date.now();
  const payload = `${userId}.${companyId}.${nonce}.${ts}`;
  const sig = createHmac("sha256", config.jwtSecret).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyOauthState(state: string): { userId: number; companyId: number } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const parts = decoded.split(".");
    if (parts.length !== 5) return null;
    const [userIdStr, companyIdStr, nonce, tsStr, providedSig] = parts;
    const payload = `${userIdStr}.${companyIdStr}.${nonce}.${tsStr}`;
    const expectedSig = createHmac("sha256", config.jwtSecret).update(payload).digest("hex");
    if (expectedSig.length !== providedSig!.length) return null;
    if (!timingSafeEqual(Buffer.from(expectedSig), Buffer.from(providedSig!))) return null;
    if (Date.now() - Number(tsStr) > STATE_TTL_MS) return null;
    return { userId: Number(userIdStr), companyId: Number(companyIdStr) };
  } catch {
    return null;
  }
}

/**
 * Returns the URL to redirect the user's browser to. The browser hits
 * Microsoft's authorize endpoint with our client id + redirect uri +
 * scopes + state; Microsoft prompts the user, then redirects back to
 * our callback with `code` + `state`.
 */
export function buildAuthorizeUrl(state: string): string | null {
  const m = getMicrosoftConfig();
  if (!m.clientId || !m.redirectUri) return null;
  const params = new URLSearchParams({
    client_id: m.clientId,
    response_type: "code",
    redirect_uri: m.redirectUri,
    response_mode: "query",
    scope: SCOPES.join(" "),
    state,
  });
  return `${M365_AUTHORIZE_URL}?${params.toString()}`;
}

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  email: string | null;
}

/**
 * Exchanges the `code` returned by the authorize callback for an
 * access + refresh token pair. Also calls /me to derive the user's
 * email address for the mailbox_accounts row.
 *
 * Throws on credential / network failure; caller should map to a
 * 502 with a user-friendly message.
 */
export async function exchangeCodeForTokens(code: string): Promise<TokenExchangeResult> {
  const m = getMicrosoftConfig();
  if (!m.clientId || !m.clientSecret || !m.redirectUri) {
    throw new Error("بيانات Microsoft 365 غير مضبوطة (clientId / clientSecret / redirectUri)");
  }
  const tokenResp = await fetch(M365_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: m.clientId,
      client_secret: m.clientSecret,
      code,
      redirect_uri: m.redirectUri,
      grant_type: "authorization_code",
      scope: SCOPES.join(" "),
    }).toString(),
  });
  if (!tokenResp.ok) {
    const err = await tokenResp.text().catch(() => "");
    throw new Error(`فشل تبادل الـ code مع Microsoft: ${tokenResp.status} ${err.slice(0, 200)}`);
  }
  const token = await tokenResp.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Lookup the user's email for the mailbox_accounts row. We use the
  // primary userPrincipalName so the operator sees the address they
  // recognise, not the Azure AD object id.
  let email: string | null = null;
  try {
    const meResp = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (meResp.ok) {
      const me = await meResp.json() as { mail?: string; userPrincipalName?: string };
      email = me.mail || me.userPrincipalName || null;
    }
  } catch (err) {
    logger.warn(err, "[microsoftOauth] /me lookup failed — proceeding without email");
  }

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
    email,
  };
}

/**
 * Trades a refresh token for a fresh access token. Called by the sync
 * worker when the saved tokenExpiresAt is within 60s of now (or already
 * past). Returns null if Microsoft rejects the refresh — the caller
 * should mark the account `auth_expired` so the operator re-OAuths.
 *
 * Note: Microsoft rotates refresh tokens on each refresh call. The
 * returned refreshToken MUST replace the stored one or the next refresh
 * will fail with invalid_grant.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
} | null> {
  const m = getMicrosoftConfig();
  if (!m.clientId || !m.clientSecret) return null;
  try {
    const resp = await fetch(M365_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: m.clientId,
        client_secret: m.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: SCOPES.join(" "),
      }).toString(),
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      logger.warn({ status: resp.status, err: err.slice(0, 200) }, "[microsoftOauth] refresh failed");
      return null;
    }
    const data = await resp.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    return {
      accessToken: data.access_token,
      // Microsoft sometimes omits refresh_token on refresh if the existing
      // one is still valid. Keep the old one in that case.
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  } catch (err) {
    logger.warn(err, "[microsoftOauth] refresh exception");
    return null;
  }
}
