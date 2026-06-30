import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PropertiesModuleDashboard {
  totalUnits?: number;
  occupiedUnits?: number;
  vacantUnits?: number;
  occupancyRate?: number;
  totalContracts?: number;
  expiringContracts?: number;
  maintenanceRequests?: number;
  overdueRents?: number;
  monthlyRevenue?: number;
  [key: string]: unknown;
}

export default function PropertiesModuleDashboardScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<PropertiesModuleDashboard>('/api/module-dashboards/properties');
  const d = (data && !Array.isArray(data)) ? data as PropertiesModuleDashboard : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة الأملاك…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const rate = d?.occupancyRate ?? 0;
  const rateColor = rate >= 90 ? '#22C55E' : rate >= 70 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة الأملاك' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: rateColor }}>
          <Text style={{ fontSize: 48, fontWeight: '700', color: rateColor }}>{rate}%</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>نسبة الإشغال</Text>
          <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 2 }}>{d?.occupiedUnits ?? 0} / {d?.totalUnits ?? 0} وحدة</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
          {[
            { label: 'وحدات شاغرة', value: d?.vacantUnits ?? 0, color: '#F59E0B' },
            { label: 'إيجارات متأخرة', value: d?.overdueRents ?? 0, color: '#EF4444' },
            { label: 'طلبات صيانة', value: d?.maintenanceRequests ?? 0, color: '#3B82F6' },
            { label: 'عقود تنتهي', value: d?.expiringContracts ?? 0, color: '#F59E0B' },
          ].map(m => (
            <View key={m.label} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {d?.monthlyRevenue != null ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: c.textMuted }}>إيراد الشهر</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#22C55E' }}>{d.monthlyRevenue.toLocaleString('ar-SA')} ر.س</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
