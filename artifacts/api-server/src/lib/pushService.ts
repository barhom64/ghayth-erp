import webpush from "web-push";
import { rawQuery, rawExecute } from "./rawdb.js";
import { decryptPushEndpoint } from "./pushCrypto.js";

let vapidInitialized = false;

function ensureVapidKeys(): void {
  if (vapidInitialized) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@ghayth.app";

  if (!publicKey || !privateKey) {
    console.warn("[Push] VAPID keys not set — push notifications will not work. Generate with: npx web-push generate-vapid-keys");
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidInitialized = true;
}

export async function sendPushToCompany(
  companyId: number,
  assignmentId: number | null,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ sent: number; failed: number }> {
  ensureVapidKeys();
  if (!vapidInitialized) return { sent: 0, failed: 0 };

  const [pushSetting] = await rawQuery<{ value: string }>(
    `SELECT value FROM system_settings WHERE key='push_enabled' AND "companyId"=$1`,
    [companyId]
  );
  if (pushSetting?.value === "false") return { sent: 0, failed: 0 };

  const conditions = [`"companyId" = $1`];
  const params: unknown[] = [companyId];
  if (assignmentId !== null) {
    conditions.push(`("assignmentId" = $2 OR "assignmentId" IS NULL)`);
    params.push(assignmentId);
  }

  const subscriptions = await rawQuery<{
    id: number;
    endpoint: string;
    p256dh: string;
    auth: string;
    endpointEncrypted: boolean;
  }>(
    `SELECT id, endpoint, "p256dh", auth, "endpointEncrypted" FROM push_subscriptions WHERE ${conditions.join(" AND ")}`,
    params
  );

  let sent = 0;
  let failed = 0;

  const payload = JSON.stringify({
    title,
    body,
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    data: data ?? {},
    timestamp: Date.now(),
  });

  for (const sub of subscriptions) {
    try {
      const endpoint = sub.endpointEncrypted ? decryptPushEndpoint(sub.endpoint) : sub.endpoint;
      await webpush.sendNotification(
        {
          endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      );
      sent++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 410 || statusCode === 404) {
        await rawExecute(`DELETE FROM push_subscriptions WHERE id = $1`, [sub.id]).catch((delErr: unknown) => {
          console.warn(`[Push] Failed to remove stale subscription ${sub.id}:`, delErr);
        });
      } else {
        console.warn(`[Push] Failed to send to subscription ${sub.id}:`, err instanceof Error ? err.message : String(err));
      }
      failed++;
    }
  }

  return { sent, failed };
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}
