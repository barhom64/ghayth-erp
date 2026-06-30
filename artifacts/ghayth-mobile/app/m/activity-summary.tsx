import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ActivitySummary { totalActions?: number; uniqueActors?: number; topAction?: string; }

export default function ActivitySummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ActivitySummary>('/api/activity-log/summary');
  const d = (data && !Array.isArray(data)) ? data as ActivitySummary : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص النشاط' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'إجمالي الإجراءات', value: d?.totalActions }, { label: 'المستخدمون النشطون', value: d?.uniqueActors }, { label: 'أكثر إجراء', value: d?.topAction }].map((row, i) => (
          <View key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8 }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '700', marginTop: 4 }}>{row.value !== undefined ? String(row.value) : '—'}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
