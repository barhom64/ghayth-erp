#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# بناء تطبيق غيث للـiOS عبر Capacitor — يُشغَّل على ماك فقط.
#
# يتطلب: macOS + Xcode + CocoaPods + حساب Apple Developer (للتوقيع/المتجر).
# لا يمكن بناء iOS على Linux/Replit (قيد Apple، لا قيد في كودنا). الكود نفسه
# (المصادقة، التتبع الخلفي، الدفع اللحظي) يعمل على iOS تماماً مثل أندرويد.
#
#   bash scripts/mobile/build-ios.sh
#
# يثبّت Capacitor + plugin التتبع، يبني النظام الكامل، يولّد مشروع ios/،
# يزامن، ثم يفتح Xcode لإكمال التوقيع والبناء/الأرشفة يدويًا.
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$REPO_ROOT/artifacts/ghayth-erp"
API_ORIGIN="${VITE_API_ORIGIN:-https://hr.door.sa}"
# manual (افتراضي: يفتح Xcode للتوقيع) أو release (أرشفة + تصدير IPA موقّع آليًا).
BUILD_MODE="${BUILD_MODE:-manual}"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "✗ بناء iOS يتطلب macOS + Xcode. شغّله على ماك."
  echo "  (الكود يدعم iOS بالكامل؛ هذا قيد Apple على أدوات البناء فقط.)"
  exit 1
fi

echo "▶ غيث — بناء تطبيق iOS"
echo "  API: $API_ORIGIN"
cd "$APP_DIR"

echo "▶ [1/5] تثبيت حزم Capacitor + iOS…"
pnpm add \
  @capacitor/core @capacitor/cli @capacitor/ios \
  @capacitor-community/background-geolocation

echo "▶ [2/5] بناء النظام الكامل…"
# BASE_PATH=/ is REQUIRED (vite.config throws without it) and MUST be root for
# the native app, so the bundle's asset URLs resolve from the WebView origin.
BASE_PATH=/ VITE_API_ORIGIN="$API_ORIGIN" pnpm build

echo "▶ [3/5] تجهيز مشروع iOS…"
if [ ! -d "$APP_DIR/ios" ]; then
  npx cap add ios
else
  echo "  ios/ موجود — تخطّي الإضافة."
fi

echo "▶ [4/5] مزامنة (cap sync)…"
npx cap sync ios

echo "▶ [5/5] أذونات الموقع — أضِفها يدويًا في Xcode › Info.plist:"
cat <<'PLIST'
    NSLocationAlwaysAndWhenInUseUsageDescription = نتتبع موقعك أثناء الدوام الميداني فقط.
    NSLocationWhenInUseUsageDescription           = نحدّد موقعك لتسجيل الحضور الميداني.
    UIBackgroundModes                              = [ location ]
PLIST

WS="$APP_DIR/ios/App/App.xcworkspace"

if [ "$BUILD_MODE" = "release" ]; then
  # ── أرشفة + تصدير IPA موقّع للمتجر آليًا (بلا فتح Xcode) ──────────────────
  echo ""
  echo "▶ أرشفة وتصدير IPA موقّع للمتجر (release)…"
  : "${EXPORT_OPTIONS_PLIST:?مطلوب EXPORT_OPTIONS_PLIST — مسار ExportOptions.plist (يحوي method=app-store + teamID + التوقيع)}"
  if [ ! -d "$WS" ]; then
    echo "✗ لم يُنشأ مشروع iOS بعد: $WS"; exit 1
  fi
  if [ ! -f "$EXPORT_OPTIONS_PLIST" ]; then
    echo "✗ ملف خيارات التصدير غير موجود: $EXPORT_OPTIONS_PLIST"; exit 1
  fi
  ARCHIVE="$APP_DIR/ios/build/App.xcarchive"
  IPA_DIR="$APP_DIR/ios/build/ipa"
  # فريق التوقيع اختياري — نمرّره كوسيط منفصل عبر مصفوفة لتفادي حقن علامات
  # الاقتباس الحرفية. التوسعة ${arr[@]+...} آمنة مع مصفوفة فارغة تحت set -u
  # على bash 3.2 (إصدار macOS الافتراضي).
  ARCHIVE_ARGS=()
  if [ -n "${DEVELOPMENT_TEAM:-}" ]; then
    ARCHIVE_ARGS+=("DEVELOPMENT_TEAM=$DEVELOPMENT_TEAM")
  fi
  # تأكّد أن أذونات الموقع أُضيفت لـInfo.plist مسبقًا (مرة واحدة) قبل الأرشفة.
  xcodebuild -workspace "$WS" -scheme App -configuration Release \
    -archivePath "$ARCHIVE" \
    ${ARCHIVE_ARGS[@]+"${ARCHIVE_ARGS[@]}"} \
    clean archive
  xcodebuild -exportArchive -archivePath "$ARCHIVE" \
    -exportOptionsPlist "$EXPORT_OPTIONS_PLIST" \
    -exportPath "$IPA_DIR"
  echo "✅ تم التصدير الموقّع: $IPA_DIR/"
  echo "   ارفعه عبر Transporter، أو:"
  echo "     xcrun altool --upload-app -t ios -f \"$IPA_DIR\"/*.ipa --apiKey <KEY> --apiIssuer <ISSUER>"
else
  echo ""
  echo "✅ تم التجهيز. أكمل في Xcode:"
  echo "     npx cap open ios"
  echo "   ثم: اختر فريق التوقيع (Signing & Capabilities) › Run على جهاز،"
  echo "   أو Product › Archive للرفع إلى TestFlight / App Store."
  echo "   (للأتمتة الكاملة بلا Xcode: BUILD_MODE=release مع EXPORT_OPTIONS_PLIST)"
fi
