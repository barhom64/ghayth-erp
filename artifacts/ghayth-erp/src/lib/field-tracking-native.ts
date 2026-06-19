// ════════════════════════════════════════════════════════════════════════════
// جسر التتبع الميداني الأصلي (Capacitor) — يعمل في الخلفية فعلاً.
//
// لماذا وحدة منفصلة: المتصفح يُجمّد JavaScript عند مغادرة الصفحة، فالتتبع
// الخلفي الحقيقي يتطلب طبقة أصلية. هذه الوحدة **خاملة تمامًا على الويب**:
//   • لا تستورد أي حزمة Capacitor بشكل ثابت — يُحقن المُحمّل عبر import()
//     ديناميكي بمحدِّد نصي (@vite-ignore) فلا يحاول Vite تضمينه في حزمة الويب.
//   • تنشط فقط داخل تطبيق Capacitor، حيث يوجد `window.Capacitor` والـplugin
//     المثبَّت (@capacitor-community/background-geolocation).
//   • على الويب: isNativeFieldTracking() = false → الصفحة تستخدم مسار
//     المتصفح (watchPosition + Wake Lock) بدلاً منها.
//
// الـplugin يُبقي خيط JS حيًّا في الخلفية عبر foreground service (أندرويد)
// فتصل نداءات الموقع والتطبيق مُصغَّر/الشاشة مقفولة. كل نقطة تُرسَل مباشرةً
// إلى POST /api/my/field/ping بتوكن Bearer محدود النطاق (لا كوكيز في الأصلي).
// ════════════════════════════════════════════════════════════════════════════

// محدِّد الـplugin كقيمة نصية في runtime — يمنع TypeScript/Vite من محاولة
// حلّه وقت البناء على الويب حيث الحزمة غير مثبّتة.
const PLUGIN_SPECIFIER = "@capacitor-community/background-geolocation";

export interface NativeLocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  altitude?: number | null;
  speed?: number | null;
  bearing?: number | null;
  time?: number | null; // epoch ms
}

export interface StartNativeOptions {
  /** التوكن المحدود النطاق من POST /my/field/tracking-token. */
  token: string;
  /** أصل الـAPI المطلق (التطبيق الأصلي يُحمَّل محليًا، فالمسار النسبي لا يكفي). */
  apiOrigin: string;
  /** يُنادى بعد كل إرسال ناجح لتحديث الواجهة. */
  onSent?: (location: NativeLocation) => void;
  /** يُنادى عند خطأ موقع/إذن. */
  onError?: (message: string) => void;
}

/** هل نعمل داخل تطبيق Capacitor أصلي (لا متصفح عادي)؟ */
export function isNativeFieldTracking(): boolean {
  const cap = (globalThis as any)?.Capacitor;
  return !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
}

let watcherId: string | null = null;

async function loadPlugin(): Promise<any> {
  const spec = PLUGIN_SPECIFIER;
  const mod: any = await import(/* @vite-ignore */ spec);
  return mod.BackgroundGeolocation ?? mod.default ?? mod;
}

/**
 * يبدأ التتبع الخلفي الأصلي. يسجّل watcher يبثّ الموقع حتى والتطبيق في
 * الخلفية، ويرسل كل نقطة فورًا إلى نقطة الـping بتوكن Bearer. يرجّع true
 * عند البدء، false إذا تعذّر (يسقط النداء إلى مسار المتصفح).
 */
export async function startNativeFieldTracking(opts: StartNativeOptions): Promise<boolean> {
  if (!isNativeFieldTracking()) return false;
  try {
    const BackgroundGeolocation = await loadPlugin();
    const pingUrl = `${opts.apiOrigin.replace(/\/$/, "")}/api/my/field/ping`;
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: "غيث — التتبع الميداني",
        backgroundMessage: "تتبع الموقع نشط أثناء الدوام",
        requestPermissions: true,
        stale: false,
        distanceFilter: 20, // متر بين النقاط — يخفّف البطارية
      },
      async (location: NativeLocation | undefined, error: any) => {
        if (error) {
          opts.onError?.(
            error?.code === "NOT_AUTHORIZED"
              ? "إذن الموقع مرفوض — فعّله من إعدادات النظام (الموقع: دائمًا)."
              : `تعذّر تحديد الموقع: ${error?.message ?? "خطأ غير معروف"}`,
          );
          return;
        }
        if (!location) return;
        try {
          await fetch(pingUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${opts.token}`,
            },
            body: JSON.stringify({
              lat: location.latitude,
              lng: location.longitude,
              accuracy: location.accuracy ?? undefined,
              speed: location.speed ?? null,
              heading: location.bearing ?? null,
              altitude: location.altitude ?? null,
              capturedAt: new Date(location.time ?? Date.now()).toISOString(),
              source: "native",
            }),
          });
          opts.onSent?.(location);
        } catch {
          // الـplugin يحتفظ بالنقطة ويعيد المحاولة؛ تجاهل الفشل اللحظي.
        }
      },
    );
    return true;
  } catch {
    return false;
  }
}

/** يوقف التتبع الأصلي ويزيل الـwatcher وإشعار الخدمة الأمامية. */
export async function stopNativeFieldTracking(): Promise<void> {
  if (!watcherId) return;
  try {
    const BackgroundGeolocation = await loadPlugin();
    await BackgroundGeolocation.removeWatcher({ id: watcherId });
  } finally {
    watcherId = null;
  }
}
