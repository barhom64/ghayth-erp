import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OnboardingData { companyName?: string; employeeName?: string; welcomeMessage?: string; steps?: string[]; }

export default function PublicOnboardingScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<OnboardingData>('/api/public/onboarding/token');
  const info = (data && !Array.isArray(data)) ? data as OnboardingData : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="رابط غير صالح" description="تحقق من الرابط وأعد المحاولة"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'استقبال موظف جديد' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {info ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16 }}>
            {!!info.companyName && <Text style={{ color: c.brand, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>{info.companyName}</Text>}
            {!!info.employeeName && <Text style={{ color: c.text, fontSize: 16, textAlign: 'center', marginTop: 8 }}>أهلًا {info.employeeName}</Text>}
            {!!info.welcomeMessage && <Text style={{ color: c.textMuted, fontSize: 14, textAlign: 'center', marginTop: 12 }}>{info.welcomeMessage}</Text>}
          </View>
        ) : <GEmptyState icon="person-add-outline" title="لا توجد بيانات" description="" />}
      </ScrollView>
    </View>
  );
}
