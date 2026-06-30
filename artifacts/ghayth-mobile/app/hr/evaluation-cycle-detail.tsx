import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EvalCycle { id?: number; name?: string; status?: string; startDate?: string; endDate?: string; completionRate?: number; participantCount?: number; }

export default function EvaluationCycleDetailScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<EvalCycle>('/api/hr/evaluation-cycles/0');
  const d = (data && !Array.isArray(data)) ? data as EvalCycle : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  const rows: [string, string][] = [
    ['الحالة', d.status ?? '-'],
    ['تاريخ البدء', d.startDate ? new Date(d.startDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'],
    ['تاريخ الانتهاء', d.endDate ? new Date(d.endDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'],
    ['نسبة الإنجاز', (d.completionRate ?? 0) + '%'],
    ['عدد المشاركين', String(d.participantCount ?? 0)],
  ];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: d.name ?? 'دورة التقييم' }} />
      <View style={{ backgroundColor: c.surface, padding: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{d.name ?? '-'}</Text>
      </View>
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
          <Text style={{ color: c.text, fontSize: 14 }}>{value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
