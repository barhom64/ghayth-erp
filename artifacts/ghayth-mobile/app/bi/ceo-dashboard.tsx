import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CeoDashboard {
  revenue?: number;
  expenses?: number;
  netProfit?: number;
  employees?: number;
  activeContracts?: number;
  openTickets?: number;
  fleetUtilization?: number;
  projectsOnTrack?: number;
  projectsAtRisk?: number;
  cashBalance?: number;
  overdueReceivables?: number;
  [key: string]: unknown;
}

export default function CeoDashboardScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<CeoDashboard>('/api/bi/ceo-dashboard');
  const d = (data && !Array.isArray(data)) ? data as CeoDashboard : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة الرئيس التنفيذي…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const profit = d?.netProfit ?? 0;
  const profitColor = profit >= 0 ? '#22C55E' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة الرئيس التنفيذي' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: profitColor }}>
          <Text style={{ fontSize: 36, fontWeight: '700', color: profitColor }}>{profit.toLocaleString('ar-SA')}</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>صافي الربح (ر.س)</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#22C55E' }}>{(d?.revenue ?? 0).toLocaleString('ar-SA')}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>الإيرادات</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#EF4444' }}>{(d?.expenses ?? 0).toLocaleString('ar-SA')}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>المصروفات</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'الموظفين', value: d?.employees ?? 0, color: c.text },
            { label: 'عقود نشطة', value: d?.activeContracts ?? 0, color: c.brand },
            { label: 'تذاكر مفتوحة', value: d?.openTickets ?? 0, color: '#F59E0B' },
            { label: 'مشاريع بخطر', value: d?.projectsAtRisk ?? 0, color: '#EF4444' },
          ].map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {d?.overdueReceivables != null ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, color: c.textMuted }}>ذمم متأخرة</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#EF4444' }}>{d.overdueReceivables.toLocaleString('ar-SA')} ر.س</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
