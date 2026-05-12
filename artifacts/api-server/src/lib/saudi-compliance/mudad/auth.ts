/**
 * OAuth2 client_credentials flow for the Mudad API.
 *
 * Each company is registered with Mudad and receives a clientId +
 * clientSecret pair. The token endpoint exchanges them for a
 * short-lived bearer token (default ~3600s). We cache the token
 * per (companyId, env) so a flurry of API calls within the TTL
 * window uses the same token instead of re-authenticating each
 * time.
 *
 * The cache is in-memory and per-process — that's fine for a
 * single api-server instance. Multi-replica deployments either
 * accept some duplicate token requests (each replica caches
 * independently) or back the cache with Redis using the existing
 * rateLimitStore.
 */
import { buildMudadUrl, MUDAD_TOKEN_PATH, type MudadEnvironment } from "./endpoints.js";

export interface MudadCredentials {
  clientId: string;
  clientSecret: string;
}

export interface CachedToken {
  accessToken: string;
  /** Epoch milliseconds when the token expires. We refresh ~30s
   *  before this so an in-flight call doesn't get rejected on the
   *  boundary. */
  expiresAt: number;
}

const TOKEN_REFRESH_LEAD_MS = 30_000;

/** In-memory cache. Key = `${env}:${companyId}`. */
const tokenCache = new Map<string, CachedToken>();

/**
 * Reset the token cache. Used by tests + by the operator-facing
 * "rotate Mudad credentials" admin action.
 */
export function clearMudadTokenCache(): void {
  tokenCache.clear();
}

/**
 * Get a valid bearer token, fetching a fresh one if the cached
 * value is missing or about to expire.
 *
 * The `fetchToken` argument is dependency-injected so unit tests
 * can pass a stub instead of the real HTTP call. Real callers use
 * `requestMudadToken` (below) which is the live HTTP fetcher.
 */
export async function getMudadAccessToken(opts: {
  companyId: number;
  env: MudadEnvironment;
  creds: MudadCredentials;
  fetchToken?: typeof requestMudadToken;
}): Promise<string> {
  const cacheKey = `${opts.env}:${opts.companyId}`;
  const now = Date.now();
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt - TOKEN_REFRESH_LEAD_MS > now) {
    return cached.accessToken;
  }

  const fetcher = opts.fetchToken ?? requestMudadToken;
  const fresh = await fetcher({ env: opts.env, creds: opts.creds });
  tokenCache.set(cacheKey, fresh);
  return fresh.accessToken;
}

/**
 * Live OAuth2 token request. POSTs `grant_type=client_credentials`
 * with the credentials in the form body (the spec's preferred
 * shape — Basic auth headers also work but are deprecated).
 */
export async function requestMudadToken(opts: {
  env: MudadEnvironment;
  creds: MudadCredentials;
  signal?: AbortSignal;
}): Promise<CachedToken> {
  const url = buildMudadUrl(opts.env, MUDAD_TOKEN_PATH);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: opts.creds.clientId,
    client_secret: opts.creds.clientSecret,
  }).toString();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    signal: opts.signal,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Mudad token request failed (HTTP ${response.status}): ${text.slice(0, 500)}`);
  }
  return parseTokenResponse(text);
}

/**
 * Pure parser — separated so unit tests can feed canned JSON
 * without spinning up a fetch mock. Throws on missing / malformed
 * fields rather than caching a sentinel that would fail every
 * subsequent API call.
 */
export function parseTokenResponse(text: string): CachedToken {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Mudad token response is not JSON");
  }
  const accessToken = json?.access_token;
  const expiresIn = Number(json?.expires_in);
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new Error("Mudad token response missing access_token");
  }
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error(`Mudad token response invalid expires_in: ${json?.expires_in}`);
  }
  return {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

/** Build the bearer header for an authenticated request. */
export function bearerHeader(token: string): string {
  if (!token) throw new Error("Mudad bearerHeader: token is empty");
  return `Bearer ${token}`;
}
