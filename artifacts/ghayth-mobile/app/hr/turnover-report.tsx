import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TurnoverReport { period?: string; total?: number; resigned?: number; terminated?: number; rate?: number; [key: string]: unknown; }

export default function TurnoverReport() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TurnoverReport>('/api/hr/turnover-report');
  const report = (data && !Array.isArray(data)) ? data as TurnoverReport : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل تقرير الدوران…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقرير دوران الموظفين' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {report ? Object.entries(report).map(([k, v]) => (
          <View key={k} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{k}</Text>
            <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{typeof v === 'number' ? v.toLocaleString('ar-SA') : String(v ?? '—')}</Text>
          </View>
        )) : <GEmptyState icon="trending-down-outline" title="لا توجد بيانات" description="" />}
      </ScrollView>
    </View>
  );
}
