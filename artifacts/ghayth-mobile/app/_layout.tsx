import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { I18nManager, Platform, Text, View } from 'react-native';
import { useOffline } from '@/hooks/useOffline';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { GLoadingState } from '@workspace/ui-native';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { registerPushNotifications } from '@/hooks/useNative';
import { apiFetch } from '@/hooks/useApi';

// إجبار RTL على كل المنصات
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
});

function AuthGate() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const c = useColors();

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
      // PWA manifest
      if (!document.querySelector('link[rel="manifest"]')) {
        const link = document.createElement('link');
        link.rel = 'manifest';
        link.href = '/manifest.json';
        document.head.appendChild(link);
      }
      // Apple touch icon
      if (!document.querySelector('link[rel="apple-touch-icon"]')) {
        const link = document.createElement('link');
        link.rel = 'apple-touch-icon';
        link.href = '/apple-touch-icon.png';
        document.head.appendChild(link);
      }
      // meta theme-color
      if (!document.querySelector('meta[name="theme-color"]')) {
        const meta = document.createElement('meta');
        meta.name = 'theme-color';
        meta.content = '#F97316';
        document.head.appendChild(meta);
      }
      // تسجيل Service Worker للـ PWA
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {/* غير حرج */});
      }
    }
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    const inLogin = segments[0] === 'login';
    if (status === 'signedOut' && !inLogin) {
      router.replace('/login');
    } else if (status === 'signedIn' && inLogin) {
      router.replace('/(tabs)');
    }
  }, [status, segments, router]);

  // تسجيل توكن الإشعارات عند تسجيل الدخول
  useEffect(() => {
    if (status !== 'signedIn') return;
    registerPushNotifications().then((token) => {
      if (!token) return;
      apiFetch('/api/notifications/push-token', {
        method: 'POST',
        body: JSON.stringify({ token: token.token, platform: token.platform }),
      }).catch(() => {/* غير حرج */});
    });
  }, [status]);

  const { isOffline } = useOffline();

  if (status === 'loading') return <GLoadingState text="جارٍ تحميل غيث…" />;

  return (
    <>
      {isOffline && (
        <View style={{ backgroundColor: '#374151', paddingVertical: 6, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, color: '#FFF', fontWeight: '600' }}>⚠ لا يوجد اتصال بالإنترنت — وضع عرض فقط</Text>
        </View>
      )}
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.text,
        headerTitleStyle: { fontWeight: '700' },
        headerTitleAlign: 'center',
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="module/[key]" options={{ title: 'الوحدة' }} />
      <Stack.Screen name="m/[module]/[section]" options={{ title: 'القائمة' }} />
      <Stack.Screen name="m/[module]/[section]/form" options={{ title: 'نموذج' }} />
      <Stack.Screen name="record" options={{ title: 'تفاصيل' }} />
      <Stack.Screen name="hr/attendance" options={{ title: 'تسجيل الحضور' }} />
      <Stack.Screen name="hr/leave-new" options={{ title: 'طلب إجازة' }} />
      <Stack.Screen name="hr/payslip" options={{ title: 'كشف الراتب' }} />
      <Stack.Screen name="hr/my-requests" options={{ title: 'طلباتي' }} />
      <Stack.Screen name="hr/overtime-new" options={{ title: 'طلب وقت إضافي' }} />
      <Stack.Screen name="hr/loan-new" options={{ title: 'طلب سلفة' }} />
      <Stack.Screen name="hr/excuse-new" options={{ title: 'طلب استئذان' }} />
      <Stack.Screen name="hr/expense-new" options={{ title: 'طلب مصروف' }} />
      <Stack.Screen name="hr/mission-new" options={{ title: 'طلب مهمة عمل' }} />
      <Stack.Screen name="support/ticket-new" options={{ title: 'تذكرة دعم جديدة' }} />
      <Stack.Screen name="crm/lead-new" options={{ title: 'عميل محتمل جديد' }} />
      <Stack.Screen name="crm/opportunity-new" options={{ title: 'فرصة بيعية جديدة' }} />
      <Stack.Screen name="crm/activity-new" options={{ title: 'تسجيل نشاط متابعة' }} />
      <Stack.Screen name="finance/payment-new" options={{ title: 'تسجيل دفعة' }} />
      <Stack.Screen name="fleet/trip-new" options={{ title: 'طلب رحلة جديدة' }} />
      <Stack.Screen name="properties/maintenance-new" options={{ title: 'طلب صيانة جديد' }} />
      <Stack.Screen name="warehouse/movement-new" options={{ title: 'حركة مخزون جديدة' }} />
      <Stack.Screen name="projects/task-new" options={{ title: 'مهمة جديدة' }} />
      <Stack.Screen name="documents/upload" options={{ title: 'رفع مستند' }} />
      <Stack.Screen name="legal/case-new" options={{ title: 'قضية جديدة' }} />
      <Stack.Screen name="finance/purchase-request-new" options={{ title: 'طلب شراء جديد' }} />
      <Stack.Screen name="hr/training-enroll" options={{ title: 'التسجيل في برنامج تدريبي' }} />
      <Stack.Screen name="finance/invoice-new" options={{ title: 'فاتورة عميل جديدة' }} />
      <Stack.Screen name="finance/vendor-invoice-new" options={{ title: 'فاتورة مورد جديدة' }} />
      <Stack.Screen name="finance/journal-new" options={{ title: 'قيد محاسبي جديد' }} />
      <Stack.Screen name="hr/exit-request-new" options={{ title: 'طلب إنهاء الخدمة' }} />
      <Stack.Screen name="crm/client-new" options={{ title: 'عميل جديد' }} />
      <Stack.Screen name="properties/contract-new" options={{ title: 'عقد إيجار جديد' }} />
      <Stack.Screen name="fleet/maintenance-new" options={{ title: 'أمر صيانة جديد' }} />
      <Stack.Screen name="umrah/pilgrim-new" options={{ title: 'تسجيل معتمر جديد' }} />
      <Stack.Screen name="hr/leave-balances" options={{ title: 'أرصدة الإجازات' }} />
      <Stack.Screen name="hr/change-password" options={{ title: 'تغيير كلمة المرور' }} />
      <Stack.Screen name="hr/my-attendance" options={{ title: 'سجل حضوري' }} />
      <Stack.Screen name="hr/my-documents" options={{ title: 'وثائقي' }} />
      <Stack.Screen name="hr/my-performance" options={{ title: 'تقييماتي' }} />
      <Stack.Screen name="search" options={{ title: 'البحث العام' }} />
      <Stack.Screen name="calendar" options={{ title: 'التقويم الموحّد' }} />
      <Stack.Screen name="assistant" options={{ title: 'المساعد الذكي' }} />
      <Stack.Screen name="exec-dashboard" options={{ title: 'لوحة المدير التنفيذي' }} />
      <Stack.Screen name="comms/conversation" options={{ title: 'المحادثة' }} />
      <Stack.Screen name="crm/client-detail" options={{ title: 'ملف العميل' }} />
      <Stack.Screen name="projects/project-detail" options={{ title: 'تفاصيل المشروع' }} />
      <Stack.Screen name="legal/case-detail" options={{ title: 'القضية' }} />
      <Stack.Screen name="properties/property-detail" options={{ title: 'العقار' }} />
      <Stack.Screen name="fleet/vehicle-detail" options={{ title: 'المركبة' }} />
      <Stack.Screen name="bi/dashboard" options={{ title: 'ذكاء الأعمال' }} />
      <Stack.Screen name="support/ticket-detail" options={{ title: 'تذكرة الدعم' }} />
      <Stack.Screen name="settings" options={{ title: 'الإعدادات' }} />
      <Stack.Screen name="umrah/pilgrim-detail" options={{ title: 'المعتمر' }} />
      <Stack.Screen name="crm/opportunity-detail" options={{ title: 'فرصة البيع' }} />
      <Stack.Screen name="warehouse/overview" options={{ title: 'المستودعات' }} />
      <Stack.Screen name="finance/invoice-detail" options={{ title: 'الفاتورة' }} />
      <Stack.Screen name="finance/purchase-order-detail" options={{ title: 'أمر الشراء' }} />
      <Stack.Screen name="finance/vendor-detail" options={{ title: 'ملف المورد' }} />
      <Stack.Screen name="hr/loan-detail" options={{ title: 'تفاصيل السلفة' }} />
      <Stack.Screen name="hr/violation-detail" options={{ title: 'المخالفة التأديبية' }} />
      <Stack.Screen name="umrah/group-detail" options={{ title: 'مجموعة العمرة' }} />
      <Stack.Screen name="properties/contract-detail" options={{ title: 'عقد الإيجار' }} />
      <Stack.Screen name="fleet/driver-detail" options={{ title: 'ملف السائق' }} />
      <Stack.Screen name="hr/payroll-detail" options={{ title: 'مسيّر الرواتب' }} />
      <Stack.Screen name="finance/journal-detail" options={{ title: 'القيد المحاسبي' }} />
      <Stack.Screen name="fleet/trip-detail" options={{ title: 'تفاصيل الرحلة' }} />
      <Stack.Screen name="fleet/fuel-log-detail" options={{ title: 'سجل الوقود' }} />
      <Stack.Screen name="fleet/insurance-detail" options={{ title: 'وثيقة التأمين' }} />
      <Stack.Screen name="fleet/violation-detail" options={{ title: 'المخالفة المرورية' }} />
      <Stack.Screen name="warehouse/movement-detail" options={{ title: 'حركة المخزون' }} />
      <Stack.Screen name="warehouse/supplier-detail" options={{ title: 'ملف المورد' }} />
      <Stack.Screen name="umrah/sub-agent-detail" options={{ title: 'الوكيل الفرعي' }} />
      <Stack.Screen name="umrah/transport-detail" options={{ title: 'رحلة النقل' }} />
      <Stack.Screen name="hr/gratuity-detail" options={{ title: 'مكافأة نهاية الخدمة' }} />
      <Stack.Screen name="hr/delegation-detail" options={{ title: 'التفويض' }} />
      <Stack.Screen name="finance/vendor-contract-detail" options={{ title: 'عقد المورد' }} />
      <Stack.Screen name="finance/bank-account-detail" options={{ title: 'الحساب البنكي' }} />
      <Stack.Screen name="finance/custody-detail" options={{ title: 'العهدة' }} />
      <Stack.Screen name="finance/salary-advance-detail" options={{ title: 'سلفة الراتب' }} />
      <Stack.Screen name="finance/obligation-detail" options={{ title: 'الالتزام' }} />
      <Stack.Screen name="finance/customer-advance-detail" options={{ title: 'دفعة العميل المقدمة' }} />
      <Stack.Screen name="finance/vendor-advance-detail" options={{ title: 'دفعة المورد المقدمة' }} />
      <Stack.Screen name="finance/commitment-detail" options={{ title: 'الالتزام التعاقدي' }} />
      <Stack.Screen name="fleet/cargo-manifest-detail" options={{ title: 'بيان الشحن' }} />
      <Stack.Screen name="umrah/agent-invoice-detail" options={{ title: 'فاتورة الوكيل' }} />
      <Stack.Screen name="crm/activity-detail" options={{ title: 'النشاط والمتابعة' }} />
      <Stack.Screen name="crm/contract-detail" options={{ title: 'العقد التجاري' }} />
      <Stack.Screen name="crm/email-campaign-detail" options={{ title: 'حملة البريد الإلكتروني' }} />
      <Stack.Screen name="properties/payment-detail" options={{ title: 'دفعة الإيجار' }} />
      <Stack.Screen name="properties/owner-detail" options={{ title: 'ملف المالك' }} />
      <Stack.Screen name="properties/inspection-detail" options={{ title: 'عملية الفحص' }} />
      <Stack.Screen name="admin/user-detail" options={{ title: 'المستخدم' }} />
      <Stack.Screen name="crm/campaign-detail" options={{ title: 'الحملة التسويقية' }} />
      <Stack.Screen name="governance/compliance-detail" options={{ title: 'بند الامتثال' }} />
      <Stack.Screen name="legal/session-detail" options={{ title: 'جلسة التقاضي' }} />
      <Stack.Screen name="requests/request-detail" options={{ title: 'تفاصيل الطلب' }} />
      <Stack.Screen name="documents/document-detail" options={{ title: 'تفاصيل المستند' }} />
      <Stack.Screen name="hr/payslip-detail" options={{ title: 'كشف الراتب' }} />
      <Stack.Screen name="hr/exit-request-detail" options={{ title: 'طلب إنهاء الخدمة' }} />
      <Stack.Screen name="umrah/package-detail" options={{ title: 'الباقة' }} />
      <Stack.Screen name="umrah/agent-detail" options={{ title: 'الوكيل' }} />
      <Stack.Screen name="fleet/maintenance-detail" options={{ title: 'أمر الصيانة' }} />
      <Stack.Screen name="projects/task-detail" options={{ title: 'المهمة' }} />
      <Stack.Screen name="projects/milestone-detail" options={{ title: 'المعلم' }} />
      <Stack.Screen name="projects/issue-detail" options={{ title: 'المشكلة' }} />
      <Stack.Screen name="umrah/violation-detail" options={{ title: 'مخالفة العمرة' }} />
      <Stack.Screen name="umrah/penalty-detail" options={{ title: 'الغرامة' }} />
      <Stack.Screen name="umrah/invoice-detail" options={{ title: 'فاتورة العمرة' }} />
      <Stack.Screen name="umrah/nusk-invoice-detail" options={{ title: 'فاتورة نُسك' }} />
      <Stack.Screen name="umrah/payment-detail" options={{ title: 'دفعة العمرة' }} />
      <Stack.Screen name="fleet/transport-booking-detail" options={{ title: 'حجز النقل' }} />
      <Stack.Screen name="fleet/transport-dispatch-detail" options={{ title: 'أمر التشغيل' }} />
      <Stack.Screen name="hr/official-letter-detail" options={{ title: 'الخطاب الرسمي' }} />
      <Stack.Screen name="hr/excuse-request-detail" options={{ title: 'طلب الاستئذان' }} />
      <Stack.Screen name="finance/collection-detail" options={{ title: 'ملف التحصيل' }} />
      <Stack.Screen name="documents/template-detail" options={{ title: 'قالب المستند' }} />
      <Stack.Screen name="hr/overtime-detail" options={{ title: 'الوقت الإضافي' }} />
      <Stack.Screen name="finance/expense-detail" options={{ title: 'المصروف' }} />
      <Stack.Screen name="warehouse/product-detail" options={{ title: 'الصنف' }} />
      <Stack.Screen name="hr/contract-detail" options={{ title: 'عقد الموظف' }} />
      <Stack.Screen name="governance/policy-detail" options={{ title: 'السياسة' }} />
      <Stack.Screen name="governance/risk-detail" options={{ title: 'المخاطرة' }} />
      <Stack.Screen name="governance/audit-detail" options={{ title: 'عملية التدقيق' }} />
      <Stack.Screen name="governance/capa-detail" options={{ title: 'الإجراء التصحيحي' }} />
      <Stack.Screen name="legal/contract-detail" options={{ title: 'العقد القانوني' }} />
      <Stack.Screen name="legal/judgment-detail" options={{ title: 'الحكم القضائي' }} />
      <Stack.Screen name="properties/unit-detail" options={{ title: 'الوحدة العقارية' }} />
      <Stack.Screen name="properties/maintenance-request-detail" options={{ title: 'طلب الصيانة' }} />
      <Stack.Screen name="hr/evaluation-detail" options={{ title: 'تقييم الأداء' }} />
      <Stack.Screen name="hr/training-detail" options={{ title: 'البرنامج التدريبي' }} />
      <Stack.Screen name="hr/leave-request-detail" options={{ title: 'طلب الإجازة' }} />
      <Stack.Screen name="finance/fixed-asset-detail" options={{ title: 'الأصل الثابت' }} />
      <Stack.Screen name="finance/voucher-detail" options={{ title: 'السند المالي' }} />
      <Stack.Screen name="finance/vendor-invoice-detail" options={{ title: 'فاتورة المورد' }} />
      <Stack.Screen name="finance/purchase-request-detail" options={{ title: 'طلب الشراء' }} />
      <Stack.Screen name="crm/lead-detail" options={{ title: 'العميل المحتمل' }} />
      <Stack.Screen name="properties/tenant-detail" options={{ title: 'ملف المستأجر' }} />
      <Stack.Screen name="warehouse/cycle-count-detail" options={{ title: 'جرد المخزون' }} />
      <Stack.Screen name="hr/discipline-detail" options={{ title: 'المذكرة التأديبية' }} />
      <Stack.Screen name="hr/recruitment-detail" options={{ title: 'الإعلان الوظيفي' }} />
      <Stack.Screen name="manager-workspace" options={{ title: 'مساحة عمل المدير' }} />
      <Stack.Screen name="finance/reports" options={{ title: 'التقارير المالية' }} />
      <Stack.Screen name="hr/employee-detail" options={{ title: 'ملف الموظف' }} />
      <Stack.Screen name="hr/employee-new" options={{ title: 'إضافة موظف جديد' }} />
      <Stack.Screen name="hr/leave-request-new" options={{ title: 'طلب إجازة جديد' }} />
      <Stack.Screen name="finance/vendor-payment-new" options={{ title: 'دفعة للمورد' }} />
      <Stack.Screen name="finance/customer-receipt-new" options={{ title: 'إيصال دفعة العميل' }} />
      <Stack.Screen name="warehouse/cycle-count-new" options={{ title: 'جرد مخزون جديد' }} />
      <Stack.Screen name="governance/risk-new" options={{ title: 'مخاطرة جديدة' }} />
      <Stack.Screen name="hr/recruitment-new" options={{ title: 'إعلان وظيفي جديد' }} />
      <Stack.Screen name="legal/session-new" options={{ title: 'جلسة تقاضي جديدة' }} />
      <Stack.Screen name="umrah/payment-new" options={{ title: 'تسجيل دفعة معتمر' }} />
      <Stack.Screen name="warehouse/product-new" options={{ title: 'إضافة صنف جديد' }} />
      <Stack.Screen name="projects/milestone-new" options={{ title: 'مرحلة جديدة' }} />
      <Stack.Screen name="governance/audit-new" options={{ title: 'تدقيق جديد' }} />
      <Stack.Screen name="governance/capa-new" options={{ title: 'إجراء تصحيحي / وقائي' }} />
      <Stack.Screen name="fleet/fuel-log-new" options={{ title: 'تسجيل مصروف وقود' }} />
      <Stack.Screen name="properties/unit-new" options={{ title: 'وحدة جديدة' }} />
      <Stack.Screen name="hr/discipline-new" options={{ title: 'إجراء تأديبي' }} />
      <Stack.Screen name="warehouse/supplier-new" options={{ title: 'إضافة مورد جديد' }} />
      <Stack.Screen name="fleet/violation-new" options={{ title: 'مخالفة مرورية جديدة' }} />
      <Stack.Screen name="projects/issue-new" options={{ title: 'مشكلة جديدة' }} />
      <Stack.Screen name="hr/evaluation-new" options={{ title: 'تقييم أداء جديد' }} />
      <Stack.Screen name="properties/tenant-new" options={{ title: 'مستأجر جديد' }} />
      <Stack.Screen name="properties/owner-new" options={{ title: 'مالك جديد' }} />
      <Stack.Screen name="properties/inspection-new" options={{ title: 'فحص عقاري جديد' }} />
      <Stack.Screen name="hr/training-enrollment-new" options={{ title: 'تسجيل مشاركة تدريب' }} />
      <Stack.Screen name="hr/contract-new" options={{ title: 'عقد عمل جديد' }} />
      <Stack.Screen name="hr/official-letter-new" options={{ title: 'خطاب رسمي جديد' }} />
      <Stack.Screen name="hr/delegation-new" options={{ title: 'تفويض صلاحيات' }} />
      <Stack.Screen name="hr/excuse-request-new" options={{ title: 'طلب عذر جديد' }} />
      <Stack.Screen name="hr/gratuity-new" options={{ title: 'مكافأة نهاية خدمة' }} />
      <Stack.Screen name="finance/collection-new" options={{ title: 'متابعة تحصيل' }} />
      <Stack.Screen name="finance/commitment-new" options={{ title: 'التزام مالي جديد' }} />
      <Stack.Screen name="finance/custody-new" options={{ title: 'عهدة جديدة' }} />
      <Stack.Screen name="finance/customer-advance-new" options={{ title: 'دفعة مقدمة من عميل' }} />
      <Stack.Screen name="finance/fixed-asset-disposal-new" options={{ title: 'صرف أصل ثابت' }} />
      <Stack.Screen name="finance/obligation-new" options={{ title: 'التزام جديد' }} />
      <Stack.Screen name="finance/salary-advance-new" options={{ title: 'سلفة راتب جديدة' }} />
      <Stack.Screen name="finance/vendor-advance-new" options={{ title: 'دفعة مقدمة للمورد' }} />
      <Stack.Screen name="finance/vendor-contract-new" options={{ title: 'عقد مورد جديد' }} />
      <Stack.Screen name="finance/voucher-new" options={{ title: 'سند قبض/صرف' }} />
      <Stack.Screen name="fleet/cargo-manifest-new" options={{ title: 'بيان شحن جديد' }} />
      <Stack.Screen name="fleet/insurance-new" options={{ title: 'تأمين مركبة جديد' }} />
      <Stack.Screen name="governance/compliance-new" options={{ title: 'مراجعة امتثال جديدة' }} />
      <Stack.Screen name="governance/policy-new" options={{ title: 'سياسة جديدة' }} />
      <Stack.Screen name="legal/contract-new" options={{ title: 'عقد قانوني جديد' }} />
      <Stack.Screen name="properties/payment-new" options={{ title: 'دفعة إيجار' }} />
      <Stack.Screen name="properties/lease-new" options={{ title: 'عقد إيجار جديد' }} />
      <Stack.Screen name="properties/property-new" options={{ title: 'عقار جديد' }} />
      <Stack.Screen name="requests/request-new" options={{ title: 'طلب جديد' }} />
      <Stack.Screen name="crm/campaign-new" options={{ title: 'حملة تسويقية جديدة' }} />
      <Stack.Screen name="crm/contract-new" options={{ title: 'عقد CRM جديد' }} />
      <Stack.Screen name="crm/email-campaign-new" options={{ title: 'حملة بريد إلكتروني' }} />
      <Stack.Screen name="documents/document-new" options={{ title: 'وثيقة جديدة' }} />
      <Stack.Screen name="documents/template-new" options={{ title: 'قالب وثيقة جديد' }} />
      <Stack.Screen name="umrah/agent-invoice-new" options={{ title: 'فاتورة وكيل عمرة' }} />
      <Stack.Screen name="umrah/invoice-new" options={{ title: 'فاتورة عمرة جديدة' }} />
      <Stack.Screen name="umrah/nusk-invoice-new" options={{ title: 'فاتورة نسك جديدة' }} />
      <Stack.Screen name="umrah/penalty-new" options={{ title: 'غرامة عمرة جديدة' }} />
      <Stack.Screen name="umrah/sub-agent-invoice-new" options={{ title: 'فاتورة وكيل فرعي' }} />
      <Stack.Screen name="umrah/transport-new" options={{ title: 'نقل عمرة جديد' }} />
      <Stack.Screen name="umrah/violation-new" options={{ title: 'مخالفة عمرة جديدة' }} />
      <Stack.Screen name="finance/purchase-order-new" options={{ title: 'أمر شراء جديد' }} />
            <Stack.Screen name="finance/bank-account-new" options={{ title: 'حساب بنكي جديد' }} />
      <Stack.Screen name="umrah/package-new" options={{ title: 'باقة عمرة جديدة' }} />
      <Stack.Screen name="fleet/transport-dispatch-new" options={{ title: 'أمر تشغيل جديد' }} />
      <Stack.Screen name="legal/judgment-new" options={{ title: 'حكم قضائي جديد' }} />
      <Stack.Screen name="admin/user-new" options={{ title: 'مستخدم جديد' }} />
      <Stack.Screen name="finance/expense-new" options={{ title: 'مصروف جديد' }} />
      <Stack.Screen name="fleet/vehicle-new" options={{ title: 'مركبة جديدة' }} />
      <Stack.Screen name="fleet/driver-new" options={{ title: 'سائق جديد' }} />
      <Stack.Screen name="projects/project-new" options={{ title: 'مشروع جديد' }} />
      <Stack.Screen name="umrah/agent-new" options={{ title: 'وكيل عمرة جديد' }} />
      <Stack.Screen name="umrah/sub-agent-new" options={{ title: 'وكيل فرعي جديد' }} />
      <Stack.Screen name="umrah/group-new" options={{ title: 'مجموعة عمرة جديدة' }} />
      <Stack.Screen name="finance/vendor-new" options={{ title: 'مورد جديد' }} />
      <Stack.Screen name="umrah/family-detail" options={{ title: 'عائلة المعتمر' }} />
      <Stack.Screen name="umrah/family-new" options={{ title: 'عائلة جديدة' }} />
      <Stack.Screen name="fleet/inspection-detail" options={{ title: 'تقرير الفحص' }} />
      <Stack.Screen name="fleet/inspection-new" options={{ title: 'فحص جديد' }} />
      <Stack.Screen name="hr/wps" options={{ title: 'نظام حماية الأجور' }} />
      <Stack.Screen name="fleet/field-tracking" options={{ title: 'التتبع الميداني' }} />
      <Stack.Screen name="umrah/accommodation-detail" options={{ title: 'إقامة المجموعة' }} />
      <Stack.Screen name="umrah/room-block-new" options={{ title: 'كتلة غرف جديدة' }} />
      <Stack.Screen name="transport/itinerary-detail" options={{ title: 'خط السير' }} />
      <Stack.Screen name="transport/itinerary-new" options={{ title: 'خط سير جديد' }} />
      <Stack.Screen name="finance/recurring-invoice-detail" options={{ title: 'الفاتورة المتكررة' }} />
      <Stack.Screen name="finance/recurring-invoice-new" options={{ title: 'فاتورة متكررة جديدة' }} />
      <Stack.Screen name="finance/insurance-detail" options={{ title: 'وثيقة التأمين' }} />
      <Stack.Screen name="finance/insurance-new" options={{ title: 'وثيقة تأمين جديدة' }} />
      <Stack.Screen name="hr/compliance" options={{ title: 'امتثال الموارد البشرية' }} />
      <Stack.Screen name="hr/org-chart" options={{ title: 'الهيكل التنظيمي' }} />
      <Stack.Screen name="careers/portal" options={{ title: 'بوابة التوظيف' }} />
      <Stack.Screen name="umrah/commission-detail" options={{ title: 'العمولة' }} />
      <Stack.Screen name="finance/operations-center" options={{ title: 'مركز العمليات' }} />
      <Stack.Screen name="umrah/reports" options={{ title: 'تقارير العمرة' }} />
      <Stack.Screen name="governance/pdpl" options={{ title: 'حماية البيانات' }} />
      <Stack.Screen name="comms/correspondence" options={{ title: 'المراسلات الرسمية' }} />
      <Stack.Screen name="governance/digital-signatures" options={{ title: 'التوقيعات الرقمية' }} />
      <Stack.Screen name="marketing/campaigns" options={{ title: 'حملات التسويق' }} />
      <Stack.Screen name="marketing/campaign-detail" options={{ title: 'الحملة' }} />
      <Stack.Screen name="marketing/campaign-new" options={{ title: 'حملة جديدة' }} />
      <Stack.Screen name="finance/deferred-revenue" options={{ title: 'الإيراد المؤجّل' }} />
      <Stack.Screen name="finance/cash-in-transit" options={{ title: 'النقد في الطريق' }} />
      <Stack.Screen name="warehouse/advanced" options={{ title: 'المخزون المتقدم' }} />
      <Stack.Screen name="umrah/import-batch" options={{ title: 'دُفعات استيراد المعتمرين' }} />
      <Stack.Screen name="umrah/import-batch-detail" options={{ title: 'تفاصيل الدُّفعة' }} />
      <Stack.Screen name="umrah/sub-agent-statement" options={{ title: 'كشف حساب الوكيل' }} />
      <Stack.Screen name="fleet/cargo" options={{ title: 'الشحن والبضائع' }} />
      <Stack.Screen name="fleet/cargo-detail" options={{ title: 'بيان الشحن' }} />
      <Stack.Screen name="bi/scheduled-reports" options={{ title: 'التقارير المجدولة' }} />
      <Stack.Screen name="hr/proactive-insights" options={{ title: 'التنبيهات الاستباقية' }} />
      <Stack.Screen name="governance/integrations" options={{ title: 'تكاملات الحوكمة' }} />
      <Stack.Screen name="admin/integrations" options={{ title: 'التكاملات الخارجية' }} />
      <Stack.Screen name="admin/system-health" options={{ title: 'صحة النظام' }} />
      <Stack.Screen name="admin/roles" options={{ title: 'الأدوار والصلاحيات' }} />
      <Stack.Screen name="admin/audit-logs" options={{ title: 'سجلات التدقيق' }} />
      <Stack.Screen name="admin/workspace" options={{ title: 'بيئة العمل' }} />
      <Stack.Screen name="admin/intelligence-alerts" options={{ title: 'تنبيهات النظام' }} />
      <Stack.Screen name="fleet/transport-booking-list" options={{ title: 'حجوزات النقل' }} />
      <Stack.Screen name="store/products" options={{ title: 'منتجات المتجر' }} />
      <Stack.Screen name="store/product-detail" options={{ title: 'المنتج' }} />
      <Stack.Screen name="store/orders" options={{ title: 'طلبات المتجر' }} />
      <Stack.Screen name="store/order-detail" options={{ title: 'الطلب' }} />
      <Stack.Screen name="notifications/index" options={{ title: 'الإشعارات' }} />
      <Stack.Screen name="umrah/refunds" options={{ title: 'طلبات الاسترداد' }} />
      <Stack.Screen name="umrah/pricing" options={{ title: 'تسعيرة العمرة' }} />
      <Stack.Screen name="settings/numbering" options={{ title: 'مركز الترقيم' }} />
      <Stack.Screen name="admin/automation" options={{ title: 'الأتمتة' }} />
      <Stack.Screen name="admin/action-center" options={{ title: 'مركز الإجراءات' }} />
      <Stack.Screen name="projects/obligations" options={{ title: 'الالتزامات التعاقدية' }} />
      <Stack.Screen name="hr/recruitment-applications" options={{ title: 'طلبات التوظيف' }} />
      <Stack.Screen name="bi/kpis" options={{ title: 'مؤشرات الأداء' }} />
      <Stack.Screen name="hr/my-space" options={{ title: 'مساحتي' }} />
      <Stack.Screen name="hr/field-tracking" options={{ title: 'التتبع الميداني' }} />
      <Stack.Screen name="finance/operations-center" options={{ title: 'مركز العمليات' }} />
      <Stack.Screen name="settings/custom-fields" options={{ title: 'الحقول المخصصة' }} />
      <Stack.Screen name="hr/org-structure" options={{ title: 'الهيكل التنظيمي' }} />
      <Stack.Screen name="bi/reports" options={{ title: 'التقارير التحليلية' }} />
      <Stack.Screen name="properties/sales" options={{ title: 'مبيعات العقارات' }} />
      <Stack.Screen name="admin/event-monitor" options={{ title: 'مراقب الأحداث' }} />
      <Stack.Screen name="hr/training-programs" options={{ title: 'برامج التدريب' }} />
      <Stack.Screen name="hr/training-enrollments" options={{ title: 'التسجيلات التدريبية' }} />
      <Stack.Screen name="bi/dashboards" options={{ title: 'لوحات المؤشرات' }} />
      <Stack.Screen name="comms/inbox" options={{ title: 'صندوق الوارد' }} />
      <Stack.Screen name="hr/recruitment-postings" options={{ title: 'وظائف شاغرة' }} />
      <Stack.Screen name="settings/branches" options={{ title: 'الفروع' }} />
      <Stack.Screen name="settings/companies" options={{ title: 'الشركات' }} />
      <Stack.Screen name="finance/approvals" options={{ title: 'موافقات مالية' }} />
      <Stack.Screen name="hr/disciplinary" options={{ title: 'الجزاءات والمخالفات' }} />
      <Stack.Screen name="crm/activities" options={{ title: 'نشاطات CRM' }} />
      <Stack.Screen name="support/sla-report" options={{ title: 'تقرير مستوى الخدمة' }} />
      <Stack.Screen name="fleet/violations" options={{ title: 'مخالفات الأسطول' }} />
      <Stack.Screen name="projects/risks" options={{ title: 'مخاطر المشاريع' }} />
      <Stack.Screen name="support/tickets" options={{ title: 'تذاكر الدعم' }} />
      <Stack.Screen name="governance/policies" options={{ title: 'السياسات' }} />
      <Stack.Screen name="governance/audits" options={{ title: 'التدقيق والمراجعة' }} />
      <Stack.Screen name="governance/capas" options={{ title: 'الإجراءات التصحيحية' }} />
      <Stack.Screen name="governance/risks" options={{ title: 'مخاطر الحوكمة' }} />
      <Stack.Screen name="legal/cases" options={{ title: 'القضايا القانونية' }} />
      <Stack.Screen name="documents/list" options={{ title: 'مكتبة الوثائق' }} />
      <Stack.Screen name="finance/gl-accounts" options={{ title: 'دليل الحسابات' }} />
      <Stack.Screen name="finance/budgets" options={{ title: 'الميزانيات' }} />
      <Stack.Screen name="finance/cost-centers" options={{ title: 'مراكز التكلفة' }} />
      <Stack.Screen name="hr/leave-types" options={{ title: 'أنواع الإجازات' }} />
      <Stack.Screen name="hr/payroll-runs" options={{ title: 'دورات الرواتب' }} />
      <Stack.Screen name="finance/cash-flow" options={{ title: 'التدفق النقدي' }} />
      <Stack.Screen name="fleet/telematics" options={{ title: 'التتبع والتليماتيك' }} />
      <Stack.Screen name="warehouse/transfers" options={{ title: 'تحويلات المستودع' }} />
      <Stack.Screen name="properties/maintenance-requests" options={{ title: 'طلبات الصيانة' }} />
      <Stack.Screen name="crm/pipeline" options={{ title: 'خط المبيعات' }} />
      <Stack.Screen name="finance/bank-reconciliation" options={{ title: 'التسوية البنكية' }} />
      <Stack.Screen name="finance/fx-rates" options={{ title: 'أسعار الصرف' }} />
      <Stack.Screen name="hr/performance-reviews" options={{ title: 'تقييمات الأداء' }} />
      <Stack.Screen name="projects/milestones" options={{ title: 'معالم المشاريع' }} />
      <Stack.Screen name="warehouse/purchase-orders" options={{ title: 'أوامر الشراء' }} />
      <Stack.Screen name="admin/system-logs" options={{ title: 'سجلات النظام' }} />
      <Stack.Screen name="properties/leases" options={{ title: 'عقود الإيجار' }} />
      <Stack.Screen name="finance/period-close" options={{ title: 'إقفال الفترات المالية' }} />
      <Stack.Screen name="fleet/routes" options={{ title: 'مسارات الأسطول' }} />
      <Stack.Screen name="hr/attendance-shifts" options={{ title: 'الورديات والجداول' }} />
      <Stack.Screen name="crm/leads" options={{ title: 'العملاء المحتملون' }} />
      <Stack.Screen name="finance/trial-balance" options={{ title: 'ميزان المراجعة' }} />
      <Stack.Screen name="hr/loans" options={{ title: 'قروض الموظفين' }} />
      <Stack.Screen name="fleet/schedule" options={{ title: 'جدول الأسطول' }} />
      <Stack.Screen name="hr/overtime" options={{ title: 'العمل الإضافي' }} />
      <Stack.Screen name="projects/issues" options={{ title: 'مشاكل المشاريع' }} />
      <Stack.Screen name="finance/invoices" options={{ title: 'الفواتير' }} />
      <Stack.Screen name="finance/journals" options={{ title: 'القيود المحاسبية' }} />
      <Stack.Screen name="finance/expenses" options={{ title: 'المصروفات' }} />
      <Stack.Screen name="finance/fixed-assets" options={{ title: 'الأصول الثابتة' }} />
      <Stack.Screen name="finance/collections" options={{ title: 'التحصيلات' }} />
      <Stack.Screen name="finance/vendor-invoices" options={{ title: 'فواتير الموردين' }} />
      <Stack.Screen name="finance/vouchers" options={{ title: 'السندات' }} />
      <Stack.Screen name="finance/payments" options={{ title: 'المدفوعات' }} />
      <Stack.Screen name="hr/employees" options={{ title: 'الموظفون' }} />
      <Stack.Screen name="hr/leave-requests" options={{ title: 'طلبات الإجازات' }} />
      <Stack.Screen name="hr/contracts" options={{ title: 'عقود الموظفين' }} />
      <Stack.Screen name="hr/delegations" options={{ title: 'التفويضات' }} />
      <Stack.Screen name="hr/gratuity" options={{ title: 'مكافأة نهاية الخدمة' }} />
      <Stack.Screen name="hr/exit-requests" options={{ title: 'طلبات إنهاء الخدمة' }} />
      <Stack.Screen name="hr/official-letters" options={{ title: 'الخطابات الرسمية' }} />
      <Stack.Screen name="fleet/vehicles" options={{ title: 'المركبات' }} />
      <Stack.Screen name="fleet/drivers" options={{ title: 'السائقون' }} />
      <Stack.Screen name="fleet/trips" options={{ title: 'الرحلات' }} />
      <Stack.Screen name="fleet/fuel-logs" options={{ title: 'سجلات الوقود' }} />
      <Stack.Screen name="fleet/maintenances" options={{ title: 'صيانة المركبات' }} />
      <Stack.Screen name="umrah/groups" options={{ title: 'مجموعات العمرة' }} />
      <Stack.Screen name="umrah/pilgrims" options={{ title: 'الحجاج' }} />
      <Stack.Screen name="umrah/packages" options={{ title: 'باقات العمرة' }} />
      <Stack.Screen name="umrah/agents" options={{ title: 'وكلاء العمرة' }} />
      <Stack.Screen name="umrah/accommodations" options={{ title: 'الإقامات' }} />
      <Stack.Screen name="umrah/penalties" options={{ title: 'غرامات العمرة' }} />
      <Stack.Screen name="properties/properties" options={{ title: 'العقارات' }} />
      <Stack.Screen name="properties/units" options={{ title: 'الوحدات العقارية' }} />
      <Stack.Screen name="properties/owners" options={{ title: 'الملاك' }} />
      <Stack.Screen name="properties/tenants" options={{ title: 'المستأجرون' }} />
      <Stack.Screen name="projects/projects" options={{ title: 'المشاريع' }} />
      <Stack.Screen name="projects/tasks" options={{ title: 'مهام المشاريع' }} />
      <Stack.Screen name="admin/users" options={{ title: 'المستخدمون' }} />
      <Stack.Screen name="crm/contracts" options={{ title: 'عقود العملاء' }} />
      <Stack.Screen name="crm/email-campaigns" options={{ title: 'حملات البريد الإلكتروني' }} />
      <Stack.Screen name="warehouse/products" options={{ title: 'المنتجات' }} />
      <Stack.Screen name="warehouse/movements" options={{ title: 'حركات المخزون' }} />
      <Stack.Screen name="warehouse/suppliers" options={{ title: 'الموردون' }} />
      <Stack.Screen name="warehouse/cycle-counts" options={{ title: 'الجرد الدوري' }} />
      <Stack.Screen name="legal/sessions" options={{ title: 'جلسات القضايا' }} />
      <Stack.Screen name="legal/judgments" options={{ title: 'الأحكام القضائية' }} />
      <Stack.Screen name="legal/contracts" options={{ title: 'العقود القانونية' }} />
      <Stack.Screen name="finance/income-statement" options={{ title: 'قائمة الدخل' }} />
      <Stack.Screen name="finance/balance-sheet" options={{ title: 'الميزانية العمومية' }} />
      <Stack.Screen name="finance/bank-accounts" options={{ title: 'الحسابات البنكية' }} />
      <Stack.Screen name="finance/vendors" options={{ title: 'الموردون' }} />
      <Stack.Screen name="finance/commitments" options={{ title: 'الالتزامات' }} />
      <Stack.Screen name="finance/recurring-invoices" options={{ title: 'الفواتير المتكررة' }} />
      <Stack.Screen name="finance/purchase-requests" options={{ title: 'طلبات الشراء' }} />
      <Stack.Screen name="finance/purchase-orders" options={{ title: 'أوامر الشراء' }} />
      <Stack.Screen name="umrah/invoices" options={{ title: 'فواتير العمرة' }} />
      <Stack.Screen name="umrah/violations" options={{ title: 'مخالفات العمرة' }} />
      <Stack.Screen name="umrah/families" options={{ title: 'عائلات العمرة' }} />
      <Stack.Screen name="umrah/sub-agents" options={{ title: 'الوكلاء الفرعيون' }} />
      <Stack.Screen name="properties/contracts" options={{ title: 'عقود الأملاك' }} />
      <Stack.Screen name="properties/inspections" options={{ title: 'معاينات الأملاك' }} />
      <Stack.Screen name="properties/payments" options={{ title: 'مدفوعات الأملاك' }} />
      <Stack.Screen name="fleet/inspections" options={{ title: 'معاينات الأسطول' }} />
      <Stack.Screen name="fleet/insurances" options={{ title: 'تأمينات الأسطول' }} />
      <Stack.Screen name="umrah/transports" options={{ title: 'نقل العمرة' }} />
      <Stack.Screen name="umrah/payments" options={{ title: 'مدفوعات العمرة' }} />
      <Stack.Screen name="finance/salary-advances" options={{ title: 'سلف الرواتب' }} />
      <Stack.Screen name="finance/customer-advances" options={{ title: 'سلف العملاء' }} />
      <Stack.Screen name="finance/vendor-advances" options={{ title: 'سلف الموردين' }} />
      <Stack.Screen name="finance/custodies" options={{ title: 'العهد المالية' }} />
      <Stack.Screen name="finance/insurances" options={{ title: 'التأمينات' }} />
      <Stack.Screen name="finance/vendor-contracts" options={{ title: 'عقود الموردين' }} />
      <Stack.Screen name="finance/obligations" options={{ title: 'الالتزامات المالية' }} />
      <Stack.Screen name="crm/clients" options={{ title: 'عملاء CRM' }} />
      <Stack.Screen name="hr/excuse-requests" options={{ title: 'طلبات الاستئذان' }} />
      <Stack.Screen name="hr/violations" options={{ title: 'مخالفات الموارد البشرية' }} />
      <Stack.Screen name="hr/disciplines" options={{ title: 'الإجراءات التأديبية' }} />
      <Stack.Screen name="hr/evaluations" options={{ title: 'تقييمات الأداء' }} />
      <Stack.Screen name="transport/itineraries" options={{ title: 'خطط الرحلات' }} />
      <Stack.Screen name="transport/bookings" options={{ title: 'حجوزات النقل' }} />
      <Stack.Screen name="transport/dispatch-orders" options={{ title: 'أوامر التوزيع' }} />
      <Stack.Screen name="requests/requests" options={{ title: 'الطلبات' }} />
      <Stack.Screen name="fleet/alerts" options={{ title: 'تنبيهات الأسطول' }} />
      <Stack.Screen name="fleet/rental-contracts" options={{ title: 'عقود إيجار الأسطول' }} />
      <Stack.Screen name="fleet/traffic-violations" options={{ title: 'مخالفات المرور' }} />
      <Stack.Screen name="warehouse/categories" options={{ title: 'فئات المستودعات' }} />
      <Stack.Screen name="properties/buildings" options={{ title: 'المباني' }} />
      <Stack.Screen name="hr/transfers" options={{ title: 'نقل الموظفين' }} />
      <Stack.Screen name="hr/salary-components" options={{ title: 'مكونات الراتب' }} />
      <Stack.Screen name="hr/positions" options={{ title: 'المناصب الوظيفية' }} />
      <Stack.Screen name="hr/missions" options={{ title: 'المأموريات' }} />
      <Stack.Screen name="support/knowledge-base" options={{ title: 'قاعدة المعرفة' }} />
      <Stack.Screen name="crm/opportunities" options={{ title: 'فرص البيع' }} />
      <Stack.Screen name="admin/companies" options={{ title: 'الشركات' }} />
      <Stack.Screen name="admin/branches" options={{ title: 'الفروع' }} />
      <Stack.Screen name="finance/pricing-rules" options={{ title: 'قواعد التسعير' }} />
      <Stack.Screen name="finance/clients" options={{ title: 'العملاء' }} />
      <Stack.Screen name="finance/cost-center-assignments" options={{ title: 'ربط مراكز التكلفة' }} />
      <Stack.Screen name="marketing/templates" options={{ title: 'قوالب التسويق' }} />
      <Stack.Screen name="transport/price-rules" options={{ title: 'قواعد أسعار النقل' }} />
      <Stack.Screen name="transport/service-lines" options={{ title: 'خطوط خدمة النقل' }} />
      <Stack.Screen name="documents/folders" options={{ title: 'مجلدات الوثائق' }} />
      <Stack.Screen name="documents/requirements" options={{ title: 'متطلبات الوثائق' }} />
      <Stack.Screen name="comms/comm-log" options={{ title: 'سجل الاتصالات' }} />
      <Stack.Screen name="comms/whatsapp" options={{ title: 'رسائل واتساب' }} />
      <Stack.Screen name="comms/sms" options={{ title: 'الرسائل القصيرة' }} />
      <Stack.Screen name="comms/pbx" options={{ title: 'سجل المكالمات' }} />
      <Stack.Screen name="fleet/breakdowns" options={{ title: 'أعطال المركبات' }} />
      <Stack.Screen name="fleet/accidents" options={{ title: 'حوادث المركبات' }} />
      <Stack.Screen name="fleet/preventive-plans" options={{ title: 'خطط الصيانة الوقائية' }} />
      <Stack.Screen name="fleet/tires" options={{ title: 'إدارة الإطارات' }} />
      <Stack.Screen name="umrah/seasons" options={{ title: 'مواسم العمرة' }} />
      <Stack.Screen name="umrah/agent-invoices" options={{ title: 'فواتير وكلاء العمرة' }} />
      <Stack.Screen name="admin/security-log" options={{ title: 'سجل الأمان' }} />
      <Stack.Screen name="admin/integration-logs" options={{ title: 'سجلات التكامل' }} />
      <Stack.Screen name="hr/approval-chains" options={{ title: 'سلاسل الاعتماد' }} />
      <Stack.Screen name="hr/approval-requests" options={{ title: 'طلبات الاعتماد' }} />
      <Stack.Screen name="hr/shift-assignments" options={{ title: 'تعيينات الورديات' }} />
      <Stack.Screen name="hr/deductions" options={{ title: 'الخصومات' }} />
      <Stack.Screen name="hr/public-holidays" options={{ title: 'العطل الرسمية' }} />
      <Stack.Screen name="hr/idp" options={{ title: 'خطط التطوير الفردية' }} />
      <Stack.Screen name="hr/company-documents" options={{ title: 'وثائق الشركة' }} />
      <Stack.Screen name="hr/expiring-documents" options={{ title: 'الوثائق المنتهية الصلاحية' }} />
      <Stack.Screen name="hr/evaluation-cycles" options={{ title: 'دورات التقييم' }} />
      <Stack.Screen name="finance/tax-codes" options={{ title: 'رموز الضريبة' }} />
      <Stack.Screen name="support/csat" options={{ title: 'رضا العملاء' }} />
      <Stack.Screen name="hr/teams" options={{ title: 'الفرق' }} />
      <Stack.Screen name="hr/committees" options={{ title: 'اللجان' }} />
      <Stack.Screen name="calendar/appointments" options={{ title: 'المواعيد' }} />
      <Stack.Screen name="requests/catalog" options={{ title: 'كتالوج الطلبات' }} />
      <Stack.Screen name="admin/notification-rules" options={{ title: 'قواعد الإشعارات' }} />
      <Stack.Screen name="admin/ai-prompts" options={{ title: 'مطالبات الذكاء الاصطناعي' }} />
      <Stack.Screen name="warehouse/lots" options={{ title: 'دفعات المستودع' }} />
      <Stack.Screen name="warehouse/serials" options={{ title: 'الأرقام التسلسلية' }} />
      <Stack.Screen name="finance/budget-variance" options={{ title: 'انحراف الميزانية' }} />
      <Stack.Screen name="finance/expenses-analysis" options={{ title: 'تحليل المصروفات' }} />
      <Stack.Screen name="admin/pbx-extensions" options={{ title: 'امتدادات PBX' }} />
      <Stack.Screen name="finance/recurring-journals" options={{ title: 'القيود الدورية' }} />
      <Stack.Screen name="comms/mailboxes" options={{ title: 'صناديق البريد' }} />
      <Stack.Screen name="finance/receivables" options={{ title: 'الذمم المدينة' }} />
      <Stack.Screen name="finance/payables" options={{ title: 'الذمم الدائنة' }} />
      <Stack.Screen name="finance/financial-requests" options={{ title: 'الطلبات المالية' }} />
      <Stack.Screen name="finance/tax-declarations" options={{ title: 'إقرارات الضريبة' }} />
      <Stack.Screen name="admin/cron-logs" options={{ title: 'سجلات المجدول' }} />
      <Stack.Screen name="admin/automation-logs" options={{ title: 'سجلات الأتمتة' }} />
      <Stack.Screen name="comms/inbox-threads" options={{ title: 'المحادثات' }} />
      <Stack.Screen name="comms/inbox-calls" options={{ title: 'سجل المكالمات' }} />
      <Stack.Screen name="comms/inbox-drafts" options={{ title: 'المسودات' }} />
      <Stack.Screen name="comms/inbox-templates" options={{ title: 'قوالب الرسائل' }} />
      <Stack.Screen name="admin/workflows" options={{ title: 'سير العمل' }} />
      <Stack.Screen name="admin/workflow-definitions" options={{ title: 'تعريفات سير العمل' }} />
      <Stack.Screen name="admin/workflow-sla" options={{ title: 'تعريفات SLA' }} />
      <Stack.Screen name="admin/proactive-rules" options={{ title: 'القواعد الاستباقية' }} />
      <Stack.Screen name="finance/zatca" options={{ title: 'إرسالات زاتكا' }} />
      <Stack.Screen name="umrah/commission-plans" options={{ title: 'خطط العمولة' }} />
      <Stack.Screen name="umrah/calendar" options={{ title: 'تقويم العمرة' }} />
      <Stack.Screen name="umrah/hotels" options={{ title: 'الفنادق' }} />
      <Stack.Screen name="umrah/room-blocks" options={{ title: 'كتل الغرف' }} />
      <Stack.Screen name="admin/ivr-menus" options={{ title: 'قوائم IVR' }} />
      <Stack.Screen name="admin/outbound-queue" options={{ title: 'طابور الإرسال' }} />
      <Stack.Screen name="admin/notification-chains" options={{ title: 'سلاسل الإشعارات' }} />
      <Stack.Screen name="careers/jobs" options={{ title: 'الوظائف المتاحة' }} />
      <Stack.Screen name="hr/saudization" options={{ title: 'نسبة السعودة' }} />
      <Stack.Screen name="hr/job-titles" options={{ title: 'المسميات الوظيفية' }} />
      <Stack.Screen name="transport/route-patterns" options={{ title: 'أنماط المسارات' }} />
      <Stack.Screen name="transport/locations" options={{ title: 'مواقع النقل' }} />
      <Stack.Screen name="fleet/telematics-devices" options={{ title: 'أجهزة التتبع' }} />
      <Stack.Screen name="transport/control-tower" options={{ title: 'برج المراقبة' }} />
      <Stack.Screen name="admin/print-templates" options={{ title: 'قوالب الطباعة' }} />
      <Stack.Screen name="marketing/funnel" options={{ title: 'مسار التسويق' }} />
      <Stack.Screen name="requests/request-types" options={{ title: 'أنواع الطلبات' }} />
      <Stack.Screen name="finance/amortization" options={{ title: 'جداول الإطفاء' }} />
      <Stack.Screen name="finance/accounting-mappings" options={{ title: 'تعيينات المحاسبة' }} />
      <Stack.Screen name="bi/operations" options={{ title: 'تأخيرات SLA' }} />
      <Stack.Screen name="governance/expiring-docs" options={{ title: 'إقامات منتهية الصلاحية' }} />
      <Stack.Screen name="admin/pdpl-retention" options={{ title: 'سياسات الاحتفاظ بالبيانات' }} />
      <Stack.Screen name="finance/vendor-credits" options={{ title: 'مذكرات ائتمان الموردين' }} />
      <Stack.Screen name="finance/payment-runs" options={{ title: 'دفعات الدفع' }} />
      <Stack.Screen name="finance/dunning-history" options={{ title: 'سجل التحصيل' }} />
      <Stack.Screen name="finance/bank-guarantees" options={{ title: 'خطابات الضمان' }} />
      <Stack.Screen name="finance/intercompany" options={{ title: 'معاملات بين الشركات' }} />
      <Stack.Screen name="finance/ar-aging" options={{ title: 'تقادم الذمم المدينة' }} />
      <Stack.Screen name="finance/ap-aging" options={{ title: 'تقادم الذمم الدائنة' }} />
      <Stack.Screen name="finance/cip" options={{ title: 'أصول قيد الإنشاء' }} />
      <Stack.Screen name="finance/treasury" options={{ title: 'الخزينة' }} />
      <Stack.Screen name="finance/fiscal-periods" options={{ title: 'الفترات المحاسبية' }} />
      <Stack.Screen name="finance/posting-failures" options={{ title: 'أخطاء الترحيل' }} />
      <Stack.Screen name="finance/cash-flow-forecast" options={{ title: 'توقعات التدفق النقدي' }} />
      <Stack.Screen name="finance/revenue-analysis" options={{ title: 'تحليل الإيرادات' }} />
      <Stack.Screen name="finance/inventory-valuation" options={{ title: 'تقييم المخزون' }} />
      <Stack.Screen name="finance/vat-reconciliation" options={{ title: 'تسوية الضريبة' }} />
      <Stack.Screen name="finance/ledger-truth" options={{ title: 'صدق الدفتر' }} />
      <Stack.Screen name="bi/ops-analytics" options={{ title: 'تحليلات العمليات' }} />
      <Stack.Screen name="admin/daily-schedule" options={{ title: 'الجدول اليومي' }} />
      <Stack.Screen name="admin/company-kpis" options={{ title: 'مؤشرات أداء الشركة' }} />
      <Stack.Screen name="finance/gl-integrity" options={{ title: 'فجوات سلامة الدفتر' }} />
      <Stack.Screen name="fleet/optimizer-runs" options={{ title: 'تشغيلات المُحسِّن' }} />
      <Stack.Screen name="fleet/expense-rules" options={{ title: 'قواعد مصروفات الأسطول' }} />
      <Stack.Screen name="transport/calendar" options={{ title: 'تقويم النقل' }} />
      <Stack.Screen name="governance/expiring-registrations" options={{ title: 'التراخيص المنتهية' }} />
      <Stack.Screen name="admin/import-batches" options={{ title: 'دفعات الاستيراد' }} />
      <Stack.Screen name="admin/comm-overview" options={{ title: 'نظرة عامة على الاتصالات' }} />
      <Stack.Screen name="warehouse/abc-classification" options={{ title: 'تصنيف ABC' }} />
      <Stack.Screen name="finance/cost-center-ranking" options={{ title: 'تصنيف مراكز التكلفة' }} />
      <Stack.Screen name="admin/governance-overview" options={{ title: 'نظرة عامة على الحوكمة' }} />
      <Stack.Screen name="admin/system-registry" options={{ title: 'سجل النظام' }} />
      <Stack.Screen name="admin/subscription" options={{ title: 'الاشتراك' }} />
      <Stack.Screen name="umrah/season-portfolio" options={{ title: 'محفظة الموسم' }} />
      <Stack.Screen name="umrah/agent-balances" options={{ title: 'أرصدة وكلاء العمرة' }} />
      <Stack.Screen name="hr/monthly-attendance" options={{ title: 'الحضور الشهري' }} />
      <Stack.Screen name="hr/turnover-report" options={{ title: 'تقرير الدوران الوظيفي' }} />
      <Stack.Screen name="hr/accruals-preview" options={{ title: 'معاينة الاستحقاقات' }} />
      <Stack.Screen name="hr/employees-status" options={{ title: 'حالة الموظفين' }} />
      <Stack.Screen name="finance/gl-pending" options={{ title: 'قيود GL المعلّقة' }} />
      <Stack.Screen name="finance/gl-cycle-count" options={{ title: 'جرد دورة — معلّق' }} />
      <Stack.Screen name="finance/gl-realized-fx" options={{ title: 'FX محقَّق — السجل' }} />
      <Stack.Screen name="finance/gl-lot-writeoff" options={{ title: 'شطب دُفعات — معلّق' }} />
      <Stack.Screen name="finance/gl-payroll-liability" options={{ title: 'التزامات رواتب — معلّقة' }} />
      <Stack.Screen name="umrah/import-logs" options={{ title: 'سجلات الاستيراد — عمرة' }} />
      <Stack.Screen name="umrah/unassigned" options={{ title: 'معتمرون غير مسنَّدين' }} />
      <Stack.Screen name="umrah/nusk-wallet" options={{ title: 'محفظة نُسك' }} />
      <Stack.Screen name="finance/accounts-gaps" options={{ title: 'فجوات استخدام الحسابات' }} />
      <Stack.Screen name="finance/allocation-rules" options={{ title: 'قواعد توزيع التكاليف' }} />
      <Stack.Screen name="finance/allocation-results" options={{ title: 'نتائج توزيع التكاليف' }} />
      <Stack.Screen name="finance/wht-categories" options={{ title: 'فئات WHT' }} />
      <Stack.Screen name="finance/dso-trend" options={{ title: 'اتجاه DSO' }} />
      <Stack.Screen name="finance/dimensional-coverage" options={{ title: 'تغطية أبعاد القيود' }} />
      <Stack.Screen name="finance/dormant-entities" options={{ title: 'الكيانات الخاملة' }} />
      <Stack.Screen name="transport/ops-dashboard" options={{ title: 'لوحة عمليات النقل' }} />
      <Stack.Screen name="warehouse/expiring" options={{ title: 'دُفعات مشارفة على الانتهاء' }} />
      <Stack.Screen name="warehouse/lot-aging" options={{ title: 'تقادم الدُفعات' }} />
      <Stack.Screen name="warehouse/cycle-count-accuracy" options={{ title: 'دقة جرد الدورة' }} />
      <Stack.Screen name="finance/transport-billing" options={{ title: 'مرشحات فوترة النقل' }} />
      <Stack.Screen name="bi/exec-dashboard" options={{ title: 'اللوحة التنفيذية' }} />
      <Stack.Screen name="bi/overdue-invoices" options={{ title: 'الفواتير المتأخرة' }} />
      <Stack.Screen name="bi/kpi-metrics" options={{ title: 'قياسات مؤشرات الأداء' }} />
      <Stack.Screen name="admin/scheduled-report-history" options={{ title: 'سجل تنفيذ التقارير' }} />
      <Stack.Screen name="admin/pbx-recordings" options={{ title: 'تسجيلات المكالمات' }} />
      <Stack.Screen name="admin/ai-providers" options={{ title: 'مزودو الذكاء الاصطناعي' }} />
      <Stack.Screen name="admin/observability" options={{ title: 'لوحة مراقبة النظام' }} />
      <Stack.Screen name="requests/workflows" options={{ title: 'تدفقات الطلبات' }} />
      <Stack.Screen name="documents/retention-due" options={{ title: 'وثائق مستحقة الحذف' }} />
      <Stack.Screen name="umrah/reconciliation" options={{ title: 'تسوية العمرة' }} />
      <Stack.Screen name="umrah/exempt-pilgrims" options={{ title: 'المعتمرون المعفيون' }} />
      <Stack.Screen name="properties/technicians" options={{ title: 'الفنيون' }} />
      <Stack.Screen name="crm/analytics" options={{ title: 'تحليلات CRM' }} />
      <Stack.Screen name="hr/self-submissions" options={{ title: 'الطلبات الذاتية للموظفين' }} />
      <Stack.Screen name="hr/onboarding-tasks" options={{ title: 'مهام تأهيل الموظفين' }} />
      <Stack.Screen name="comms/queue-stats" options={{ title: 'إحصاءات طابور الاتصالات' }} />
      <Stack.Screen name="finance/budget-approvals" options={{ title: 'طلبات اعتماد الميزانية' }} />
      <Stack.Screen name="finance/custodies-summary" options={{ title: 'ملخص العُهد' }} />
      <Stack.Screen name="legal/upcoming-sessions" options={{ title: 'الجلسات القادمة' }} />
      <Stack.Screen name="legal/renewal-alerts" options={{ title: 'تنبيهات تجديد العقود' }} />
      <Stack.Screen name="governance/compliance-dashboard" options={{ title: 'لوحة الامتثال' }} />
      <Stack.Screen name="governance/compliance-actions" options={{ title: 'إجراءات الامتثال' }} />
      <Stack.Screen name="governance/stats" options={{ title: 'إحصاءات الحوكمة' }} />
      <Stack.Screen name="documents/stats" options={{ title: 'إحصاءات المستندات' }} />
      <Stack.Screen name="documents/ocr-extractions" options={{ title: 'مستخلصات OCR' }} />
      <Stack.Screen name="warehouse/cycle-count-plans" options={{ title: 'خطط الجرد الدوري' }} />
      <Stack.Screen name="umrah/commission-calculations" options={{ title: 'احتساب العمولات' }} />
      <Stack.Screen name="umrah/unlinked-agents" options={{ title: 'وكلاء غير مرتبطين' }} />
      <Stack.Screen name="finance/subsidiary-state" options={{ title: 'حالة إحلال الحسابات' }} />
      <Stack.Screen name="finance/dimensional-health" options={{ title: 'صحة التوجيه الأبعادي' }} />
      <Stack.Screen name="finance/entity-ranking" options={{ title: 'تصنيف الكيانات ربحيةً' }} />
      <Stack.Screen name="properties/stats" options={{ title: 'إحصاءات الأملاك' }} />
      <Stack.Screen name="admin/violations-report" options={{ title: 'تقرير المخالفات' }} />
      <Stack.Screen name="admin/automation-stats" options={{ title: 'إحصاءات الأتمتة' }} />
      <Stack.Screen name="comms/email-domains" options={{ title: 'نطاقات البريد الإلكتروني' }} />
      <Stack.Screen name="comms/pbx-available-extensions" options={{ title: 'تحويلات PBX المتاحة' }} />
      <Stack.Screen name="admin/activity-summary" options={{ title: 'ملخص النشاط' }} />
      <Stack.Screen name="dashboards/hr-module" options={{ title: 'لوحة الموارد البشرية' }} />
      <Stack.Screen name="dashboards/fleet-module" options={{ title: 'لوحة الأسطول' }} />
      <Stack.Screen name="dashboards/legal-module" options={{ title: 'لوحة القانونية' }} />
      <Stack.Screen name="dashboards/crm-module" options={{ title: 'لوحة CRM' }} />
      <Stack.Screen name="dashboards/projects-module" options={{ title: 'لوحة المشاريع' }} />
      <Stack.Screen name="store/stats" options={{ title: 'إحصاءات المتجر' }} />
      <Stack.Screen name="marketing/stats" options={{ title: 'إحصاءات التسويق' }} />
      <Stack.Screen name="support/stats" options={{ title: 'إحصاءات الدعم' }} />
      <Stack.Screen name="+not-found" options={{ title: 'غير موجود' }} />
    </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <AuthProvider>
              <AuthGate />
            </AuthProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
