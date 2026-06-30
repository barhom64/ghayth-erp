import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AttendanceStats {
  present?: number;
  absent?: number;
  late?: number;
  totalEmployees?: number;
  month?: string;
  [key: string]: unknown;
}

export default function AttendanceStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<AttendanceStats>('/api/hr/attendance-stats');
  const d = (data && !Array.isArray(data)) ? data as AttendanceStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات الحضور…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const total = (d?.present ?? 0) + (d?.absent ?? 0);
  const attendancePct = total > 0 ? Math.round(((d?.present ?? 0) / total) * 100) : 0;
  const pctColor = attendancePct >= 90 ? '#22C55E' : attendancePct >= 75 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات الحضور' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {d?.month ? (
          <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>الفترة: {d.month}</Text>
        ) : null}
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: pctColor }}>
          <Text style={{ fontSize: 48, fontWeight: '700', color: pctColor }}>{attendancePct}%</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>نسبة الحضور</Text>
          <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 2 }}>من {d?.totalEmployees ?? 0} موظف</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
          {[
            { label: 'حاضر', value: d?.present ?? 0, color: '#22C55E' },
            { label: 'غائب', value: d?.absent ?? 0, color: '#EF4444' },
            { label: 'متأخر', value: d?.late ?? 0, color: '#F59E0B' },
          ].map(m => (
            <View key={m.label} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
