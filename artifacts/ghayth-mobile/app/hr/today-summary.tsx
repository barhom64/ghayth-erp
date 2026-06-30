import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TodaySummary { present?: number; absent?: number; late?: number; onLeave?: number; totalEmployees?: number; }

export default function AttendanceTodaySummary() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TodaySummary>('/api/hr/attendance/today-summary');
  const d = (data && !Array.isArray(data)) ? data as TodaySummary : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص الحضور اليوم' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'حاضر', value: d?.present, color: '#22c55e' }, { label: 'غائب', value: d?.absent, color: '#ef4444' }, { label: 'متأخر', value: d?.late, color: '#f59e0b' }, { label: 'في إجازة', value: d?.onLeave, color: '#3b82f6' }, { label: 'إجمالي الموظفين', value: d?.totalEmployees, color: undefined }].map((row, i) => (
          <View key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{row.label}</Text>
            <Text style={{ color: row.color ?? c.text, fontSize: 22, fontWeight: '700' }}>{row.value !== undefined ? String(row.value) : '—'}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
