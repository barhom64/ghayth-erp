import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PortalDashboard {
  clientName?: string;
  openInvoices?: number;
  openTickets?: number;
  activeProjects?: number;
  totalOutstanding?: number;
}

export default function PortalDashboardScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<PortalDashboard>('/api/portal/dashboard');
  const d = (data && !Array.isArray(data)) ? data as PortalDashboard : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل بوابة العميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const stat = (label: string, val?: number | string, color?: string) => (
    <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16, flex: 1 }}>
      <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center' }}>{label}</Text>
      <Text style={{ fontSize: 24, fontWeight: '700', color: color ?? c.text, textAlign: 'center', marginTop: 4 }}>{val ?? 0}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'بوابة العميل' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {d?.clientName ? (
          <Text style={{ fontSize: 18, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>
            مرحباً، {d.clientName}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
          {stat('فواتير مفتوحة', d?.openInvoices, '#F59E0B')}
          {stat('تذاكر دعم', d?.openTickets, '#EF4444')}
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
          {stat('مشاريع نشطة', d?.activeProjects, '#22C55E')}
          {stat('المستحقات', d?.totalOutstanding != null ? `${Number(d.totalOutstanding).toLocaleString('ar-SA')} ر.س` : '—', '#EF4444')}
        </View>
      </ScrollView>
    </View>
  );
}
