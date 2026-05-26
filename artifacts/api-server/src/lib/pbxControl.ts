/**
 * PBX Control helpers — IVR resolution + STT queue management.
 *
 * Two distinct concerns in one file because they share the same
 * call-id seam and the same "vendor not configured = graceful no-op"
 * contract:
 *
 *   1. IVR resolver — given a (companyId, menuSlug, dtmfKey), returns
 *                     the next action a PBX vendor (FreePBX / Asterisk
 *                     / 3CX / Twilio) should take. The PBX hits a
 *                     webhook with the key the caller pressed; we
 *                     answer with vendor-agnostic JSON it interprets.
 *
 *   2. STT queue — enqueueTranscription() inserts a pending row;
 *                  runPendingTranscription() picks one up. The actual
 *                  speech-to-text call is gated behind config.ai.sttProvider —
 *                  if no provider is configured, the row is marked
 *                  'failed' with a clear reason instead of hanging in
 *                  'pending' forever. When a vendor is wired, the
 *                  callsite to it lives in this function and nowhere else.
 *
 * Both surfaces are read-mostly; the IVR resolver caches menu + options
 * for 60s so a high-call-rate tenant doesn't hammer the DB on every
 * keypress.
 */
import { rawQuery, rawExecute } from "./rawdb.js";
import { logger } from "./logger.js";

export type IvrAction =
  | { kind: "extension"; extension: string; ringTimeoutSeconds?: number }
  | { kind: "menu"; menuSlug: string }
  | { kind: "voicemail"; extension?: string }
  | { kind: "department"; departmentId: number; extension?: string }
  | { kind: "hangup" }
  | { kind: "greeting"; text: string; audioUrl: string | null; options: Array<{ dtmfKey: string; label: string }>; timeoutSeconds: number };

interface IvrMenuRow {
  id: number;
  slug: string;
  greetingText: string;
  greetingAudioUrl: string | null;
  timeoutSeconds: number;
  fallbackAction: string;
  fallbackTargetExtension: string | null;
  fallbackTargetMenuId: number | null;
}

interface IvrOptionRow {
  id: number;
  menuId: number;
  dtmfKey: string;
  label: string;
  action: string;
  targetExtension: string | null;
  targetMenuId: number | null;
  targetDepartmentId: number | null;
  targetMenuSlug?: string | null;
}

const MENU_TTL_MS = 60_000;
interface MenuCacheEntry { menu: IvrMenuRow; options: IvrOptionRow[]; expiresAt: number; }
const menuCache = new Map<string, MenuCacheEntry>();

export function invalidatePbxControlCache(): void {
  menuCache.clear();
}

async function loadMenu(companyId: number, slug: string): Promise<MenuCacheEntry | null> {
  const key = `${companyId}:${slug}`;
  const cached = menuCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached;
  try {
    const [menu] = await rawQuery<IvrMenuRow>(
      `SELECT id, slug, "greetingText", "greetingAudioUrl", "timeoutSeconds",
              "fallbackAction", "fallbackTargetExtension", "fallbackTargetMenuId"
         FROM ivr_menus
        WHERE "companyId" = $1 AND slug = $2 AND status = 'active'
        LIMIT 1`,
      [companyId, slug],
    );
    if (!menu) return null;
    // Join targetMenuSlug so the resolver can return slug-based jumps
    // without a second round-trip when a key maps to another menu.
    const options = await rawQuery<IvrOptionRow>(
      `SELECT o.id, o."menuId", o."dtmfKey", o.label, o.action,
              o."targetExtension", o."targetMenuId", o."targetDepartmentId",
              tm.slug AS "targetMenuSlug"
         FROM ivr_menu_options o
         LEFT JOIN ivr_menus tm ON tm.id = o."targetMenuId"
        WHERE o."menuId" = $1
        ORDER BY o."sortOrder", o.id`,
      [menu.id],
    );
    const entry = { menu, options, expiresAt: Date.now() + MENU_TTL_MS };
    menuCache.set(key, entry);
    return entry;
  } catch (err) {
    logger.warn(err, `[pbxControl] loadMenu(${companyId},${slug}) failed`);
    return null;
  }
}

/**
 * Resolve what the PBX vendor should do for a given caller. When
 * `dtmfKey` is undefined, returns the menu greeting + options so the
 * vendor can play prompts; when set, returns the action mapped to
 * that key, or the menu's fallback if the key is unknown.
 */
export async function resolveIvrAction(
  companyId: number,
  menuSlug: string,
  dtmfKey?: string,
): Promise<IvrAction | null> {
  const entry = await loadMenu(companyId, menuSlug);
  if (!entry) return null;

  if (!dtmfKey) {
    return {
      kind: "greeting",
      text: entry.menu.greetingText,
      audioUrl: entry.menu.greetingAudioUrl,
      timeoutSeconds: entry.menu.timeoutSeconds,
      options: entry.options.map((o) => ({ dtmfKey: o.dtmfKey, label: o.label })),
    };
  }

  const hit = entry.options.find((o) => o.dtmfKey === dtmfKey);
  if (hit) return optionToAction(hit);

  // Unknown key → fall back to the menu's configured default.
  switch (entry.menu.fallbackAction) {
    case "hangup":
      return { kind: "hangup" };
    case "extension":
      return entry.menu.fallbackTargetExtension
        ? { kind: "extension", extension: entry.menu.fallbackTargetExtension }
        : { kind: "hangup" };
    case "menu":
      if (entry.menu.fallbackTargetMenuId) {
        const [next] = await rawQuery<{ slug: string }>(
          `SELECT slug FROM ivr_menus WHERE id = $1 LIMIT 1`,
          [entry.menu.fallbackTargetMenuId],
        );
        if (next) return resolveIvrAction(companyId, next.slug);
      }
      return { kind: "hangup" };
    default:
      return { kind: "hangup" };
  }
}

function optionToAction(o: IvrOptionRow): IvrAction {
  switch (o.action) {
    case "extension":
      return o.targetExtension
        ? { kind: "extension", extension: o.targetExtension }
        : { kind: "hangup" };
    case "menu":
      return o.targetMenuSlug
        ? { kind: "menu", menuSlug: o.targetMenuSlug }
        : { kind: "hangup" };
    case "voicemail":
      return { kind: "voicemail", extension: o.targetExtension ?? undefined };
    case "department":
      return o.targetDepartmentId
        ? { kind: "department", departmentId: o.targetDepartmentId, extension: o.targetExtension ?? undefined }
        : { kind: "hangup" };
    case "hangup":
    default:
      return { kind: "hangup" };
  }
}

// ─────────────────────── STT queue ──────────────────────────────────────

/**
 * Insert (or upsert) a pending transcript row for a given call. Caller
 * is the worker that listens for /pbx/completed; once a recording URL
 * exists, this gets called and the transcription queue picks it up.
 */
export async function enqueueTranscription(
  callId: number,
  companyId: number,
  language: "ar" | "en" = "ar",
): Promise<number> {
  try {
    // Upsert pattern via ON CONFLICT — re-enqueuing an existing call
    // resets it to pending without losing the row id.
    const result = await rawExecute(
      `INSERT INTO pbx_call_transcripts ("callId", "companyId", language, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT ("callId") DO UPDATE
         SET status = 'pending',
             language = EXCLUDED.language,
             "errorMessage" = NULL`,
      [callId, companyId, language],
    );
    return result.insertId;
  } catch (err) {
    logger.warn(err, `[pbxControl] enqueueTranscription(${callId}) failed`);
    return 0;
  }
}

/**
 * Pull the oldest pending transcript and process it. Returns null
 * when the queue is empty. When no STT vendor is configured, the row
 * is marked 'failed' with a clear reason so the operator can act —
 * vs. hanging in 'pending' indefinitely.
 *
 * Wiring a vendor later: replace the "STT_NOT_CONFIGURED" branch
 * with a call to the vendor SDK and write the transcript text +
 * provider name + transcribedAt timestamp into the same row. The
 * surrounding lifecycle (status, errorMessage, AI summary trigger)
 * doesn't need to change.
 */
export async function runPendingTranscription(): Promise<{ callId: number; status: string } | null> {
  // FOR UPDATE SKIP LOCKED so multiple workers can run safely.
  try {
    const rows = await rawQuery<{ id: number; callId: number; companyId: number }>(
      `WITH next AS (
         SELECT id, "callId", "companyId"
           FROM pbx_call_transcripts
          WHERE status = 'pending'
          ORDER BY "createdAt" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
       )
       UPDATE pbx_call_transcripts t
          SET status = 'transcribing'
         FROM next
        WHERE t.id = next.id
       RETURNING t.id, t."callId", t."companyId"`,
    );
    if (rows.length === 0) return null;
    const { id, callId } = rows[0]!;

    // No vendor wired yet. Mark failed with a clear reason so the
    // operator UI surfaces what's blocking transcription instead of
    // letting the row sit in 'pending' silently.
    await rawExecute(
      `UPDATE pbx_call_transcripts
          SET status = 'failed',
              "errorMessage" = 'STT_NOT_CONFIGURED — wire a speech-to-text vendor in lib/pbxControl.runPendingTranscription()'
        WHERE id = $1`,
      [id],
    );
    return { callId, status: "failed" };
  } catch (err) {
    logger.warn(err, "[pbxControl] runPendingTranscription failed");
    return null;
  }
}
