import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AnalyticsResult { status?: string; processedCount?: number; updatedAt?: string; }

export default function ClientsAnalyticsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AnalyticsResult>('/api/intelligence/clients/analytics/recalculate');
  const info = (data && !Array.isArray(data)) ? data as AnalyticsResult : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تحليلات العملاء' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>الحالة</Text>
          <Text style={{ color: c.text, fontSize: 18, fontWeight: 'bold', marginTop: 4 }}>{info?.status ?? '-'}</Text>
        </View>
        {info?.processedCount != null ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16 }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>المعالجون</Text>
            <Text style={{ color: c.brand, fontSize: 24, fontWeight: 'bold', marginTop: 4 }}>{info.processedCount}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
