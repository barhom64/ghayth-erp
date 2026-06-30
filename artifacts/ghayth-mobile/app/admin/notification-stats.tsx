import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface NotificationStats {
  totalSent?: number;
  deliveredCount?: number;
  failedCount?: number;
  pendingCount?: number;
  byChannel?: Record<string, number>;
  deliveryRate?: number;
  [key: string]: unknown;
}

export default function NotificationStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<NotificationStats>('/api/automation/notification-stats');
  const d = (data && !Array.isArray(data)) ? data as NotificationStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات الإشعارات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const rate = d?.deliveryRate ?? 0;
  const rateColor = rate >= 90 ? '#22C55E' : rate >= 70 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات الإشعارات' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: rateColor }}>
          <Text style={{ fontSize: 48, fontWeight: '700', color: rateColor }}>{rate}%</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>معدل التسليم</Text>
          <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 2 }}>{d?.deliveredCount ?? 0} من {d?.totalSent ?? 0}</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
          {[
            { label: 'في الانتظار', value: d?.pendingCount ?? 0, color: '#F59E0B' },
            { label: 'فشل', value: d?.failedCount ?? 0, color: '#EF4444' },
          ].map(m => (
            <View key={m.label} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
