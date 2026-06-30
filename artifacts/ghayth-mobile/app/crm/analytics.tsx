import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CrmAnalytics {
  totalClients?: number;
  newClientsThisMonth?: number;
  totalOpportunities?: number;
  wonOpportunities?: number;
  totalRevenue?: number;
  conversionRate?: number;
  avgDealSize?: number;
  [key: string]: unknown;
}

export default function CrmAnalyticsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<CrmAnalytics>('/api/crm/analytics');
  const d = (data && !Array.isArray(data)) ? data as CrmAnalytics : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل تحليلات CRM…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const metrics = [
    { label: 'إجمالي العملاء', value: d?.totalClients?.toLocaleString('ar-SA') ?? '0', color: c.brand },
    { label: 'عملاء جدد هذا الشهر', value: d?.newClientsThisMonth?.toLocaleString('ar-SA') ?? '0', color: '#22C55E' },
    { label: 'إجمالي الفرص', value: d?.totalOpportunities?.toLocaleString('ar-SA') ?? '0', color: '#3B82F6' },
    { label: 'فرص مُغلقة', value: d?.wonOpportunities?.toLocaleString('ar-SA') ?? '0', color: '#22C55E' },
    { label: 'معدل التحويل', value: d?.conversionRate != null ? `${((d.conversionRate as number) * 100).toFixed(1)}%` : '—', color: '#F59E0B' },
    { label: 'متوسط حجم الصفقة', value: d?.avgDealSize != null ? `${(d.avgDealSize as number).toLocaleString('ar-SA')} ر.س` : '—', color: c.text },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تحليلات CRM' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 }}>
          {metrics.map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center', borderTopWidth: 3, borderTopColor: m.color }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: m.color, marginBottom: 4 }}>{m.value}</Text>
              <Text style={{ fontSize: 10, color: c.textMuted, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
