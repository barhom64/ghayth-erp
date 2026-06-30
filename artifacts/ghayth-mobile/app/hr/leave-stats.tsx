import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LeaveStats {
  totalRequests?: number;
  approvedRequests?: number;
  pendingRequests?: number;
  rejectedRequests?: number;
  totalDaysTaken?: number;
  avgDaysPerEmployee?: number;
  [key: string]: unknown;
}

export default function LeaveStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<LeaveStats>('/api/hr/leave-stats');
  const d = (data && !Array.isArray(data)) ? data as LeaveStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات الإجازات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const total = d?.totalRequests ?? 0;
  const approved = d?.approvedRequests ?? 0;
  const rate = total > 0 ? Math.round((approved / total) * 100) : 0;
  const rateColor = rate >= 70 ? '#22C55E' : rate >= 50 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات الإجازات' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: rateColor }}>
          <Text style={{ fontSize: 48, fontWeight: '700', color: rateColor }}>{rate}%</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>نسبة الاعتماد</Text>
          <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 2 }}>{approved} من {total} طلب</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'قيد المراجعة', value: d?.pendingRequests ?? 0, color: '#F59E0B' },
            { label: 'مرفوضة', value: d?.rejectedRequests ?? 0, color: '#EF4444' },
            { label: 'إجمالي الأيام', value: d?.totalDaysTaken ?? 0, color: c.text },
            { label: 'متوسط / موظف', value: d?.avgDaysPerEmployee ?? 0, color: c.brand },
          ].map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
