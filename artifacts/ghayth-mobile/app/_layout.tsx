import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { I18nManager, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoadingState } from "@/components/ui";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

// Force RTL Arabic layout. On native this flips the whole layout direction;
// component styles also use explicit row-reverse / textAlign for web parity.
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
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.dir = "rtl";
      document.documentElement.lang = "ar";
    }
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    const inLogin = segments[0] === "login";
    if (status === "signedOut" && !inLogin) {
      router.replace("/login");
    } else if (status === "signedIn" && inLogin) {
      router.replace("/(tabs)");
    }
  }, [status, segments, router]);

  if (status === "loading") return <LoadingState label="جارٍ تحميل غيث…" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.text,
        headerTitleStyle: { fontWeight: "700" },
        headerTitleAlign: "center",
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ title: "الملف الشخصي" }} />
      <Stack.Screen name="change-password" options={{ title: "تغيير كلمة المرور" }} />
      <Stack.Screen name="action-center" options={{ title: "مركز الاعتماد" }} />
      <Stack.Screen name="calendar" options={{ title: "التقويم" }} />
      <Stack.Screen name="hr/attendance" options={{ title: "سجل الحضور" }} />
      <Stack.Screen name="hr/leaves" options={{ title: "طلبات الإجازة" }} />
      <Stack.Screen name="hr/leave-new" options={{ title: "طلب إجازة جديد" }} />
      <Stack.Screen name="module/[key]" options={{ title: "الوحدة" }} />
      <Stack.Screen name="m/[module]/[section]" options={{ title: "القائمة" }} />
      <Stack.Screen name="record" options={{ title: "تفاصيل" }} />
      <Stack.Screen name="+not-found" options={{ title: "غير موجود" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
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
            <KeyboardProvider>
              <AuthProvider>
                <AuthGate />
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
