import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FleetModuleDashboard {
  vehicles?: { total?: number; active?: number; inUse?: number; needsService?: number; outOfService?: number };
  trips?: { total?: number; active?: number; completed?: number; totalDistance?: number; totalCost?: number };
  maintenance?: { total?: number; pending?: number; totalCost?: number };
  fuel?: { totalCost?: number; totalLiters?: number };
  [key: string]: unknown;
}

export default function FleetModuleDashboardScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<FleetModuleDashboard>('/api/module-dashboards/fleet');
  const d = (data && !Array.isArray(data)) ? data as FleetModuleDashboard : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة الأسطول…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة الأسطول' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {/* Vehicles */}
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>المركبات</Text>
          <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }}>
            {[
              { label: 'الإجمالي', value: d?.vehicles?.total ?? 0, color: c.text },
              { label: 'نشط', value: d?.vehicles?.active ?? 0, color: '#22C55E' },
              { label: 'في رحلة', value: d?.vehicles?.inUse ?? 0, color: c.brand },
              { label: 'يحتاج خدمة', value: d?.vehicles?.needsService ?? 0, color: '#F59E0B' },
              { label: 'خارج الخدمة', value: d?.vehicles?.outOfService ?? 0, color: '#EF4444' },
            ].map(m => (
              <View key={m.label} style={{ alignItems: 'center', minWidth: '28%' }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: m.color }}>{m.value}</Text>
                <Text style={{ fontSize: 10, color: c.textMuted, textAlign: 'center' }}>{m.label}</Text>
              </View>
            ))}
          </View>
        </View>
        {/* Trips */}
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>الرحلات</Text>
          <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
            {[
              { label: 'نشطة', value: d?.trips?.active ?? 0, color: c.brand },
              { label: 'مكتملة', value: d?.trips?.completed ?? 0, color: '#22C55E' },
              { label: 'الإجمالي', value: d?.trips?.total ?? 0, color: c.text },
            ].map(m => (
              <View key={m.label} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: m.color }}>{m.value}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>{m.label}</Text>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 8 }}>
            {(d?.trips?.totalDistance ?? 0).toLocaleString('ar-SA')} كم | {(d?.trips?.totalCost ?? 0).toLocaleString('ar-SA')} ر.س
          </Text>
        </View>
        {/* Maintenance & Fuel */}
        <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: '#F59E0B' }}>{d?.maintenance?.pending ?? 0}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>صيانة معلقة</Text>
            <Text style={{ fontSize: 11, color: c.textFaint }}>{(d?.maintenance?.totalCost ?? 0).toLocaleString('ar-SA')} ر.س</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{(d?.fuel?.totalLiters ?? 0).toLocaleString('ar-SA')}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>لتر وقود</Text>
            <Text style={{ fontSize: 11, color: c.textFaint }}>{(d?.fuel?.totalCost ?? 0).toLocaleString('ar-SA')} ر.س</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
