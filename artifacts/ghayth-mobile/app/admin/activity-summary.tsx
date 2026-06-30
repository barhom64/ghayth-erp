import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ActivitySummary {
  pendingRequests?: number;
  pendingLeaves?: number;
  overdueInvoices?: number;
  openTickets?: number;
  todayAttendance?: number;
  expiringContracts?: number;
  lowStock?: number;
  unreadNotifications?: number;
  [key: string]: unknown;
}

export default function ActivitySummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<ActivitySummary>('/api/activity-log/summary');
  const d = (data && !Array.isArray(data)) ? data as ActivitySummary : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل ملخص النشاط…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const items = [
    { label: 'طلبات معلقة', value: d?.pendingRequests ?? 0, color: '#F59E0B' },
    { label: 'إجازات معلقة', value: d?.pendingLeaves ?? 0, color: '#F59E0B' },
    { label: 'فواتير متأخرة', value: d?.overdueInvoices ?? 0, color: '#EF4444' },
    { label: 'تذاكر مفتوحة', value: d?.openTickets ?? 0, color: '#EF4444' },
    { label: 'حضور اليوم', value: d?.todayAttendance ?? 0, color: '#22C55E' },
    { label: 'عقود تنتهي', value: d?.expiringContracts ?? 0, color: '#F59E0B' },
    { label: 'مخزون منخفض', value: d?.lowStock ?? 0, color: '#EF4444' },
    { label: 'إشعارات غير مقروءة', value: d?.unreadNotifications ?? 0, color: c.brand },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص النشاط' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 }}>
          {items.map(item => (
            <View key={item.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center', borderTopWidth: item.value > 0 ? 3 : 0, borderTopColor: item.color }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: item.value > 0 ? item.color : c.textMuted, marginBottom: 4 }}>{item.value}</Text>
              <Text style={{ fontSize: 10, color: c.textMuted, textAlign: 'center' }}>{item.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
