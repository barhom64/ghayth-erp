import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Summary { total?: number; overdue?: number; upcoming?: number; }

export default function ObligationsSummary() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Summary>('/api/obligations/summary');
  const s = (data && !Array.isArray(data)) ? data as Summary : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !s) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const rows = [
    { label: 'الإجمالي', value: String(s.total ?? 0) },
    { label: 'متأخرة', value: String(s.overdue ?? 0) },
    { label: 'قادمة', value: String(s.upcoming ?? 0) },
  ];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص الالتزامات' }} />
      {rows.map(r => (
        <View key={r.label} style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{r.label}</Text>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{r.value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
