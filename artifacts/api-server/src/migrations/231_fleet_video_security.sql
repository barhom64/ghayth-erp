-- ===========================================================================
-- 231_fleet_video_security.sql — Video Security Layer (#1354 Ibrahim review)
-- ---------------------------------------------------------------------------
-- WHAT:    Implements the three video-security requirements Ibrahim flagged
--          in the PR review before he would approve a Pilot rollout:
--            (1) Signed proxy URL — the client never receives the raw CMSV6
--                RTSP/HLS URL on session open. Instead it receives a
--                proxy URL bound to a short-lived token that ONLY this
--                server can mint.
--            (2) Short-lived tokens — `streamProxyExpiresAt` defaults to 60s
--                (FLEET_TELEMATICS_PROXY_TTL_SEC), max 300s. After expiry
--                the proxy returns 401 and the operator must re-open.
--            (3) Audit every video access — `fleet_video_access_logs`
--                records who fetched the proxy URL, when, from what IP,
--                and whether it was granted or denied (with reason).
--
-- WHY:     Without these three layers a CMSV6 video URL that leaks (browser
--          history, screen-share, mis-pasted in a chat) is replayable
--          forever — anyone on the network with that URL can pull the
--          stream. The proxy token + DB-bound expiry + audit log close
--          the loop: a leaked URL is useless past 60s, and any access
--          attempt is forensically visible.
--
-- SAFETY:  Additive only. Two new columns on `fleet_video_sessions` plus
--          one new audit table with FK to the session. All
--          IF NOT EXISTS / IF EXISTS guarded so re-apply is a no-op.
--
-- @rollback:
--   DROP TABLE IF EXISTS public.fleet_video_access_logs;
--   ALTER TABLE public.fleet_video_sessions
--     DROP COLUMN IF EXISTS "streamProxyToken",
--     DROP COLUMN IF EXISTS "streamProxyExpiresAt";
--   DROP INDEX IF EXISTS public.idx_fleet_video_sessions_proxy_token;
-- ===========================================================================

ALTER TABLE public.fleet_video_sessions
  ADD COLUMN IF NOT EXISTS "streamProxyToken" TEXT,
  ADD COLUMN IF NOT EXISTS "streamProxyExpiresAt" TIMESTAMP WITH TIME ZONE;

-- The token is a 32-byte base64url string (~43 chars). Indexed because
-- the proxy endpoint looks sessions up by token in the hot path. Partial
-- index so expired/cleared tokens don't bloat the BTREE.
CREATE INDEX IF NOT EXISTS idx_fleet_video_sessions_proxy_token
  ON public.fleet_video_sessions ("streamProxyToken")
  WHERE "streamProxyToken" IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fleet_video_access_logs (
  id            BIGSERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL REFERENCES public.companies(id),
  "sessionId"   INTEGER NOT NULL
                REFERENCES public.fleet_video_sessions(id) ON DELETE CASCADE,
  "accessedBy"  INTEGER,
  "accessedAt"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "accessIp"    VARCHAR(45),
  "userAgent"   TEXT,
  status        VARCHAR(20) NOT NULL,
  "errorReason" TEXT,
  CONSTRAINT fleet_video_access_logs_status_check CHECK (
    status IN (
      'granted',
      'denied_token',
      'denied_expired',
      'denied_session',
      'denied_user'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_fleet_video_access_logs_session_time
  ON public.fleet_video_access_logs ("sessionId", "accessedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_video_access_logs_company_time
  ON public.fleet_video_access_logs ("companyId", "accessedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_video_access_logs_user
  ON public.fleet_video_access_logs ("accessedBy", "accessedAt" DESC);

COMMENT ON COLUMN public.fleet_video_sessions."streamProxyToken"
  IS 'Base64url 32-byte signed token gating GET /telematics/video/proxy/:id; cleared on close/expiry. Issued at session open per Ibrahim PR review (#1354).';
COMMENT ON COLUMN public.fleet_video_sessions."streamProxyExpiresAt"
  IS 'When streamProxyToken stops being valid. Default 60s (FLEET_TELEMATICS_PROXY_TTL_SEC), max 300s.';
COMMENT ON TABLE  public.fleet_video_access_logs
  IS 'Forensic audit trail for every proxy URL fetch — granted/denied with reason (#1354).';
