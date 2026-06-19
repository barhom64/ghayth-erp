#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# بناء تطبيق غيث الجوال (النظام الكامل) عبر Capacitor — أتمتة كاملة.
#
# يلفّ النظام الكامل (كل المسارات والصفحات كما هي على الويب) في تطبيق أندرويد
# أصلي مثبَّت، مع التتبع الميداني الخلفي. شغّله على بيئة فيها Android SDK
# (Replit mobile / Android Studio). أمر واحد ينفّذ كل شيء:
#
#   bash scripts/mobile/build-android.sh
#
# المتطلبات: Node + pnpm (موجودان)، وAndroid SDK (ANDROID_HOME مضبوط) للبناء
# النهائي للـAPK. بدون SDK يكمل حتى توليد مشروع android/ ثم يطبع التعليمات.
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── المسارات ────────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$REPO_ROOT/artifacts/ghayth-erp"
# أصل الـAPI للتطبيق الأصلي (الحزمة محلية، فالمسار النسبي لا يكفي).
API_ORIGIN="${VITE_API_ORIGIN:-https://hr.door.sa}"

echo "▶ غيث — بناء تطبيق الجوال (النظام الكامل)"
echo "  المستودع : $REPO_ROOT"
echo "  التطبيق  : $APP_DIR"
echo "  API      : $API_ORIGIN"
cd "$APP_DIR"

# ── 1) تثبيت Capacitor + plugin التتبع الخلفي (MIT مجاني) ────────────────────
echo "▶ [1/6] تثبيت حزم Capacitor…"
pnpm add \
  @capacitor/core @capacitor/cli @capacitor/android \
  @capacitor-community/background-geolocation

# ── 2) بناء النظام الكامل (Vite) — ينتج dist/ = webDir ───────────────────────
echo "▶ [2/6] بناء النظام الكامل…"
VITE_API_ORIGIN="$API_ORIGIN" pnpm build

# ── 3) توليد مشروع أندرويد (idempotent) ──────────────────────────────────────
echo "▶ [3/6] تجهيز مشروع أندرويد…"
if [ ! -d "$APP_DIR/android" ]; then
  npx cap add android
else
  echo "  android/ موجود — تخطّي الإضافة."
fi

# ── 4) مزامنة الويب + الـplugins داخل المشروع الأصلي ─────────────────────────
echo "▶ [4/6] مزامنة (cap sync)…"
npx cap sync android

# ── 5) حقن أذونات الموقع الخلفي في AndroidManifest ───────────────────────────
echo "▶ [5/6] حقن أذونات الموقع الخلفي…"
node "$REPO_ROOT/scripts/mobile/inject-android-permissions.mjs"

# ── 6) البناء النهائي للـAPK (يتطلب Android SDK) ─────────────────────────────
echo "▶ [6/6] بناء APK…"
if [ -d "$APP_DIR/android" ] && command -v sdkmanager >/dev/null 2>&1 || [ -n "${ANDROID_HOME:-}" ]; then
  ( cd "$APP_DIR/android" && ./gradlew assembleDebug )
  APK="$APP_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
  if [ -f "$APK" ]; then
    echo "✅ تم! ملف التطبيق:"
    echo "   $APK"
    echo "   ثبّته على جوال الموظف (فعّل «مصادر غير معروفة»)."
  fi
else
  echo "ℹ️  Android SDK غير مضبوط (ANDROID_HOME). تم تجهيز كل شيء عدا التجميع."
  echo "   أكمل البناء بأحد الطريقتين:"
  echo "     • Android Studio:  npx cap open android  →  Build › Build APK"
  echo "     • سطر الأوامر:      cd artifacts/ghayth-erp/android && ./gradlew assembleDebug"
fi

echo "▶ انتهى."
