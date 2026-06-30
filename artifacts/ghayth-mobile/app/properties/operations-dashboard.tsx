import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PropertiesOpsDashboard {
  openMaintenanceRequests?: number;
  urgentRequests?: number;
  avgResponseHours?: number;
  techniciansAvailable?: number;
  expiringContracts30Days?: number;
  pendingInspections?: number;
  overduePayments?: number;
  vacancyRate?: number;
  [key: string]: unknown;
}

export default function PropertiesOpsDashboardScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<PropertiesOpsDashboard>('/api/properties/operations-dashboard');
  const d = (data && !Array.isArray(data)) ? data as PropertiesOpsDashboard : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة العمليات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة عمليات الأملاك' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'طلبات صيانة مفتوحة', value: d?.openMaintenanceRequests ?? 0, color: '#F59E0B' },
            { label: 'طلبات عاجلة', value: d?.urgentRequests ?? 0, color: '#EF4444' },
            { label: 'فنيون متاحون', value: d?.techniciansAvailable ?? 0, color: '#22C55E' },
            { label: 'فحوصات معلقة', value: d?.pendingInspections ?? 0, color: '#3B82F6' },
            { label: 'عقود تنتهي (30 يوم)', value: d?.expiringContracts30Days ?? 0, color: '#F59E0B' },
            { label: 'دفعات متأخرة', value: d?.overduePayments ?? 0, color: '#EF4444' },
          ].map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {d?.avgResponseHours != null ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, color: c.textMuted }}>متوسط وقت الاستجابة</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{d.avgResponseHours} ساعة</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
