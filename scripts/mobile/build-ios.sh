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
VITE_API_ORIGIN="$API_ORIGIN" pnpm build

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

echo ""
echo "✅ تم التجهيز. أكمل في Xcode:"
echo "     npx cap open ios"
echo "   ثم: اختر فريق التوقيع (Signing & Capabilities) › Run على جهاز،"
echo "   أو Product › Archive للرفع إلى TestFlight / App Store."
