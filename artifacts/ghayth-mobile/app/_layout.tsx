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
