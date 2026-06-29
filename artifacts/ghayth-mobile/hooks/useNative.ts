/**
 * useNative — واجهة موحّدة للميزات الأصلية (Capacitor)
 * على الويب: تعود بـ null أو تستخدم browser APIs بديلة
 * على Native: تستخدم Capacitor plugins
 */
import { Platform } from 'react-native';
import { useEffect, useRef, useState } from 'react';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

// ─── Push Notifications ───────────────────────────────────────────────────────

export interface PushToken { token: string; platform: 'ios' | 'android' }

export async function registerPushNotifications(): Promise<PushToken | null> {
  if (!isNative) return null;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return null;
    await PushNotifications.register();
    return new Promise((resolve) => {
      PushNotifications.addListener('registration', (token) => {
        resolve({ token: token.value, platform: Platform.OS as 'ios' | 'android' });
      });
      PushNotifications.addListener('registrationError', () => resolve(null));
    });
  } catch {
    return null;
  }
}

export function usePushNotifications(onNotification?: (data: Record<string, unknown>) => void) {
  useEffect(() => {
    if (!isNative || !onNotification) return;
    let cleanup: (() => void) | undefined;
    import('@capacitor/push-notifications').then(({ PushNotifications }) => {
      const listener = PushNotifications.addListener('pushNotificationReceived', (notification) => {
        onNotification(notification.data ?? {});
      });
      cleanup = () => listener.then(l => l.remove());
    });
    return () => cleanup?.();
  }, [onNotification]);
}

// ─── Geolocation ──────────────────────────────────────────────────────────────

export interface GeoPosition { lat: number; lng: number; accuracy?: number }

export async function getCurrentPosition(): Promise<GeoPosition | null> {
  if (isNative) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? undefined };
    } catch {
      return null;
    }
  }
  // web fallback
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

export function useCurrentPosition() {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = async () => {
    setLoading(true);
    setError(null);
    const pos = await getCurrentPosition();
    if (pos) setPosition(pos);
    else setError('تعذّر تحديد موقعك');
    setLoading(false);
  };

  return { position, loading, error, refresh: fetch };
}

// ─── Camera ───────────────────────────────────────────────────────────────────

export interface PhotoResult { base64: string; mimeType: string; webPath?: string }

export async function takePhoto(): Promise<PhotoResult | null> {
  if (isNative) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
      });
      if (!photo.base64String) return null;
      return { base64: photo.base64String, mimeType: photo.format === 'png' ? 'image/png' : 'image/jpeg' };
    } catch {
      return null;
    }
  }
  // web fallback: input[type=file]
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] ?? '';
        resolve({ base64, mimeType: file.type, webPath: result });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

export function pickFromGallery(): Promise<PhotoResult | null> {
  if (isNative) {
    return import('@capacitor/camera').then(async ({ Camera, CameraResultType, CameraSource }) => {
      try {
        const photo = await Camera.getPhoto({
          quality: 85,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Photos,
        });
        if (!photo.base64String) return null;
        return { base64: photo.base64String, mimeType: photo.format === 'png' ? 'image/png' : 'image/jpeg' };
      } catch {
        return null;
      }
    });
  }
  return takePhoto(); // على الويب نفس الـ flow
}

// ─── Local Notifications ──────────────────────────────────────────────────────

export async function scheduleLocalNotification(opts: {
  id: number;
  title: string;
  body: string;
  at: Date;
}): Promise<void> {
  if (!isNative) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return;
    await LocalNotifications.schedule({
      notifications: [{ id: opts.id, title: opts.title, body: opts.body, schedule: { at: opts.at } }],
    });
  } catch { /* غير حرج */ }
}
