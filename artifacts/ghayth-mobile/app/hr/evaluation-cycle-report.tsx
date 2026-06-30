import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CycleReport { cycleId?: number; totalEmployees?: number; completed?: number; avgScore?: number; }

export default function EvaluationCycleReportScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CycleReport>('/api/hr/evaluation-cycles/0/system-report');
  const d = (data && !Array.isArray(data)) ? data as CycleReport : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  if (!d) return <GEmptyState icon="bar-chart-outline" title="لا توجد بيانات" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقرير دورة التقييم' }} />
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>إجمالي الموظفين</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.totalEmployees ?? '—'}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>مكتمل</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.completed ?? '—'}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>متوسط الدرجة</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.avgScore ?? '—'}</Text>
        </View>
      </View>
    </ScrollView>
  );
}
