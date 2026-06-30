import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FleetStats {
  totalVehicles?: number;
  activeVehicles?: number;
  inMaintenance?: number;
  totalDrivers?: number;
  activeTrips?: number;
  fuelCostMonth?: number;
  maintenanceCostMonth?: number;
  utilizationRate?: number;
  [key: string]: unknown;
}

export default function FleetStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<FleetStats>('/api/fleet/stats');
  const d = (data && !Array.isArray(data)) ? data as FleetStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات الأسطول…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const rate = d?.utilizationRate ?? 0;
  const rateColor = rate >= 80 ? '#22C55E' : rate >= 60 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات الأسطول' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: rateColor }}>
          <Text style={{ fontSize: 48, fontWeight: '700', color: rateColor }}>{rate}%</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>معدل الاستخدام</Text>
          <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 2 }}>{d?.activeVehicles ?? 0} / {d?.totalVehicles ?? 0} مركبة</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
          {[
            { label: 'في الصيانة', value: d?.inMaintenance ?? 0, color: '#F59E0B' },
            { label: 'السائقون', value: d?.totalDrivers ?? 0, color: c.brand },
            { label: 'رحلات نشطة', value: d?.activeTrips ?? 0, color: '#3B82F6' },
          ].map(m => (
            <View key={m.label} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 26, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted }}>{m.label}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#EF4444' }}>{(d?.fuelCostMonth ?? 0).toLocaleString('ar-SA')}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>تكلفة الوقود (شهري)</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#F59E0B' }}>{(d?.maintenanceCostMonth ?? 0).toLocaleString('ar-SA')}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>تكلفة الصيانة (شهري)</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
