import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OnboardingData { token?: string; employeeName?: string; tasks?: string[]; }

export default function OnboardingToken() {
  const c = useColors();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { data, isLoading, isError, refetch } = useList<OnboardingData>(`/api/public/onboarding/${token}`);
  const item = (data && !Array.isArray(data)) ? data as OnboardingData : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !item) return <GEmptyState icon="alert-circle-outline" title="رابط غير صالح" description="تحقق من الرابط وأعد المحاولة" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'استقبال الموظف' }} />
      <View style={{ backgroundColor: c.surface, margin: 12, borderRadius: 8, padding: 16 }}>
        <Text style={{ color: c.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>مرحبًا {item.employeeName ?? ''}</Text>
        {(item.tasks ?? []).map((task, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
            <Text style={{ color: c.brand }}>•</Text>
            <Text style={{ color: c.text, fontSize: 14 }}>{task}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
