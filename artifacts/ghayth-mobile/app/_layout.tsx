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
import { I18nManager, Platform } from 'react-native';
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

  if (status === 'loading') return <GLoadingState text="جارٍ تحميل غيث…" />;

  return (
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
      <Stack.Screen name="+not-found" options={{ title: 'غير موجود' }} />
    </Stack>
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
