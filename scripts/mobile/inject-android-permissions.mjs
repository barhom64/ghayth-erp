// ════════════════════════════════════════════════════════════════════════════
// حقن أذونات الموقع الخلفي في AndroidManifest.xml (idempotent).
//
// بعد `npx cap add android` يولّد Capacitor manifest أساسيًا بلا أذونات
// الموقع. @capacitor-community/background-geolocation يتطلب أذونات الموقع
// الدقيق + الخلفي + الخدمة الأمامية كي يعمل التتبع والتطبيق مقفول. هذا
// السكربت يضيفها مرة واحدة (لا يكرّرها عند إعادة التشغيل).
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST = join(
  REPO_ROOT,
  "artifacts/ghayth-erp/android/app/src/main/AndroidManifest.xml",
);

if (!existsSync(MANIFEST)) {
  console.error(`✗ لم يُعثر على AndroidManifest. شغّل \`npx cap add android\` أولاً:\n  ${MANIFEST}`);
  process.exit(1);
}

const PERMISSIONS = [
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_BACKGROUND_LOCATION",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_LOCATION",
  "android.permission.WAKE_LOCK",
];

let xml = readFileSync(MANIFEST, "utf8");
let added = 0;

const lines = PERMISSIONS
  .filter((p) => !xml.includes(`android:name="${p}"`))
  .map((p) => `    <uses-permission android:name="${p}" />`);

if (lines.length > 0) {
  // أدرج قبل وسم <application> (موجود دائمًا في manifest المولَّد).
  const marker = xml.indexOf("<application");
  if (marker === -1) {
    console.error("✗ لم يُعثر على <application> في الـmanifest.");
    process.exit(1);
  }
  // ارجع لبداية السطر الذي يحوي <application>.
  const lineStart = xml.lastIndexOf("\n", marker) + 1;
  xml = xml.slice(0, lineStart) + lines.join("\n") + "\n\n" + xml.slice(lineStart);
  added = lines.length;
  writeFileSync(MANIFEST, xml, "utf8");
}

console.log(
  added > 0
    ? `✅ أُضيفت ${added} أذونات موقع/خدمة أمامية إلى AndroidManifest.`
    : "ℹ️  كل الأذونات موجودة مسبقًا — لا تغيير.",
);
