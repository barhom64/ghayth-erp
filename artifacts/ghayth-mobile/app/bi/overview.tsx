import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface BiOverview {
  totalRevenue?: number;
  totalExpenses?: number;
  netProfit?: number;
  activeProjects?: number;
  openTickets?: number;
  fleetUtilization?: number;
  employeeCount?: number;
  [key: string]: unknown;
}

export default function BiOverviewScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<BiOverview>('/api/bi/overview');
  const d = (data && !Array.isArray(data)) ? data as BiOverview : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل نظرة BI العامة…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const metrics = [
    { label: 'الإيرادات', value: d?.totalRevenue != null ? `${d.totalRevenue.toLocaleString('ar-SA')} ر.س` : '—', color: '#22C55E' },
    { label: 'المصروفات', value: d?.totalExpenses != null ? `${d.totalExpenses.toLocaleString('ar-SA')} ر.س` : '—', color: '#EF4444' },
    { label: 'صافي الربح', value: d?.netProfit != null ? `${d.netProfit.toLocaleString('ar-SA')} ر.س` : '—', color: d?.netProfit != null && d.netProfit >= 0 ? '#22C55E' : '#EF4444' },
    { label: 'المشاريع النشطة', value: String(d?.activeProjects ?? 0), color: c.brand },
    { label: 'تذاكر مفتوحة', value: String(d?.openTickets ?? 0), color: '#F59E0B' },
    { label: 'الموظفون', value: String(d?.employeeCount ?? 0), color: c.brand },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نظرة BI العامة' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {metrics.map(m => (
            <View key={m.label} style={{ flex: 1, minWidth: '45%', backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {d?.fleetUtilization != null ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>استخدام الأسطول</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>{Math.round(d.fleetUtilization)}%</Text>
            </View>
            <View style={{ height: 8, backgroundColor: c.border, borderRadius: 4 }}>
              <View style={{ height: 8, backgroundColor: c.brand, borderRadius: 4, width: `${Math.min(d.fleetUtilization, 100)}%` as never }} />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
