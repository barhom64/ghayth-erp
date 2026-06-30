import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FleetModuleDashboard {
  totalVehicles?: number;
  activeVehicles?: number;
  inMaintenance?: number;
  utilization?: number;
  tripCount?: number;
  fuelCost?: number;
  [key: string]: unknown;
}

export default function ModuleDashboardFleetScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<FleetModuleDashboard>('/api/module-dashboards/fleet');
  const d = (data && !Array.isArray(data)) ? data as FleetModuleDashboard : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة الأسطول…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const pct = Math.round(d?.utilization ?? 0);
  const color = pct >= 80 ? '#22C55E' : pct >= 60 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة الأسطول' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        {d?.utilization != null ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: color }}>
            <Text style={{ fontSize: 48, fontWeight: '700', color }}>{pct}%</Text>
            <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>معدل الاستخدام</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
          {[
            { label: 'إجمالي المركبات', value: d?.totalVehicles ?? 0, color: c.brand },
            { label: 'نشطة', value: d?.activeVehicles ?? 0, color: '#22C55E' },
            { label: 'في الصيانة', value: d?.inMaintenance ?? 0, color: '#F59E0B' },
          ].map(m => (
            <View key={m.label} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {d?.tripCount != null || d?.fuelCost != null ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, gap: 8 }}>
            {d.tripCount != null ? (
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, color: c.text }}>عدد الرحلات</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>{d.tripCount}</Text>
              </View>
            ) : null}
            {d.fuelCost != null ? (
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, color: c.text }}>تكلفة الوقود</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#EF4444' }}>{d.fuelCost.toLocaleString('ar-SA')} ر.س</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
