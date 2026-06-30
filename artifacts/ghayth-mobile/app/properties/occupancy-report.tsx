import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OccupancyReport {
  total?: number;
  occupied?: number;
  available?: number;
  maintenance?: number;
  occupancyRate?: number;
  units?: unknown[];
  [key: string]: unknown;
}

export default function OccupancyReportScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<OccupancyReport>('/api/properties/occupancy-report');
  const d = (data && !Array.isArray(data)) ? data as OccupancyReport : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقرير الإشغال…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const rate = d?.occupancyRate ?? (d?.total && d.total > 0 ? Math.round(((d.occupied ?? 0) / d.total) * 100) : 0);
  const rateColor = rate >= 80 ? '#22C55E' : rate >= 60 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقرير الإشغال' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: rateColor }}>
          <Text style={{ fontSize: 48, fontWeight: '700', color: rateColor }}>{rate}%</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>نسبة الإشغال</Text>
          <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 2 }}>{d?.occupied ?? 0} من {d?.total ?? 0} وحدة</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
          {[
            { label: 'شاغرة', value: d?.available ?? 0, color: '#22C55E' },
            { label: 'صيانة', value: d?.maintenance ?? 0, color: '#F59E0B' },
          ].map(m => (
            <View key={m.label} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
