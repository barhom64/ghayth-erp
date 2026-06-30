import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UmrahDashboard {
  totalGroups?: number;
  activeGroups?: number;
  totalPilgrims?: number;
  accommodatedPilgrims?: number;
  pendingInvoices?: number;
  totalRevenue?: number;
  currentSeason?: string;
}

export default function UmrahDashboardScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<UmrahDashboard>('/api/umrah/dashboard');
  const d = (data && !Array.isArray(data)) ? data as UmrahDashboard : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة العمرة…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة العمرة' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {d?.currentSeason ? (
          <View style={{ backgroundColor: c.brand, borderRadius: 10, padding: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: '#fff', opacity: 0.8 }}>الموسم الحالي</Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff', marginTop: 4 }}>{d.currentSeason}</Text>
          </View>
        ) : null}
        {[
          { label: 'إجمالي المجموعات', value: String(d?.totalGroups ?? 0) },
          { label: 'المجموعات النشطة', value: String(d?.activeGroups ?? 0) },
          { label: 'إجمالي الحجاج', value: String(d?.totalPilgrims ?? 0) },
          { label: 'المقيمون', value: String(d?.accommodatedPilgrims ?? 0) },
          { label: 'فواتير معلّقة', value: String(d?.pendingInvoices ?? 0) },
          { label: 'إجمالي الإيرادات', value: `${(d?.totalRevenue ?? 0).toLocaleString('ar-SA')} ر.س` },
        ].map((row) => (
          <View key={row.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14,
            flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: c.textMuted }}>{row.label}</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{row.value}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
