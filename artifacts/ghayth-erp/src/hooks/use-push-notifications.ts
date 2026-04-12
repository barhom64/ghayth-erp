import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export type PushPermission = "default" | "granted" | "denied";

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  useEffect(() => {
    if (!isSupported) return;
    setPermission(Notification.permission as PushPermission);
    checkSubscription();
  }, []);

  async function checkSubscription() {
    if (!isSupported) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    } catch {
      setIsSubscribed(false);
    }
  }

  async function urlBase64ToUint8Array(base64String: string): Promise<Uint8Array> {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError("المتصفح لا يدعم الإشعارات");
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);

      if (perm !== "granted") {
        setError("تم رفض إذن الإشعارات");
        return false;
      }

      let vapidKey: string;
      try {
        const keyResp = await apiFetch<{ publicKey: string }>("/communications/push/vapid-key");
        vapidKey = keyResp.publicKey;
      } catch {
        setError("خادم الإشعارات غير متاح حالياً");
        return false;
      }

      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const reg = await navigator.serviceWorker.ready;

      const applicationServerKey = await urlBase64ToUint8Array(vapidKey);
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });

      const subJson = subscription.toJSON();
      await apiFetch("/communications/push/subscribe", {
        method: "POST",
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      });

      setIsSubscribed(true);
      return true;
    } catch (err: any) {
      setError(err.message ?? "فشل تفعيل الإشعارات");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await apiFetch("/communications/push/unsubscribe", {
          method: "DELETE",
          body: JSON.stringify({ endpoint }),
        }).catch(() => {});
      }
      setIsSubscribed(false);
      return true;
    } catch (err: any) {
      setError(err.message ?? "فشل إلغاء الإشعارات");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  const testPush = useCallback(async (): Promise<void> => {
    try {
      await apiFetch("/communications/push/test", { method: "POST" });
    } catch (err: any) {
      setError(err.message ?? "فشل إرسال إشعار التجربة");
    }
  }, []);

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
    testPush,
  };
}
