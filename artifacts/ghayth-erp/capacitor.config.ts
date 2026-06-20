// تهيئة Capacitor لتطبيق غيث الميداني — يقرأها الـcap CLI فقط (خارج src،
// فلا يدخل typecheck/البناء على الويب). يلفّ مخرجات Vite (dist) في WebView
// أصلي مع plugin التتبع الخلفي. خطوات البناء الكاملة في:
//   docs/hr/FIELD_TRACKING_NATIVE_BACKGROUND_DESIGN.md
//
// لا نستورد أنواع @capacitor/cli هنا لإبقاء الملف خاملاً قبل تثبيت Capacitor.

interface CapacitorConfigShape {
  appId: string;
  appName: string;
  webDir: string;
  server?: { androidScheme?: string; iosScheme?: string; cleartext?: boolean };
  plugins?: Record<string, unknown>;
}

const config: CapacitorConfigShape = {
  appId: "sa.door.ghayth",
  appName: "غيث",
  // Vite's build.outDir is `dist/public` (vite.config.ts), so the built
  // index.html lives at dist/public/index.html — Capacitor must point THERE,
  // not at `dist`, or `cap sync` copies an empty folder and the app loads a
  // blank screen.
  webDir: "dist/public",
  server: { androidScheme: "https" },
  plugins: {
    // @capacitor-community/background-geolocation — لا إعداد إلزامي هنا؛
    // الأذونات تُضبط في AndroidManifest.xml و Info.plist (انظر الوثيقة).
  },
};

export default config;
