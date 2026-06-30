import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DeliveryStats {
  totalSent?: number;
  delivered?: number;
  failed?: number;
  pending?: number;
  byChannel?: Record<string, { sent?: number; delivered?: number; failed?: number }>;
  deliveryRate?: number;
}

export default function AdminNotificationDeliveryStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<DeliveryStats>('/api/notification-engine/delivery-stats');
  const d = (data && !Array.isArray(data)) ? data as DeliveryStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات التسليم…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const rate = Math.round(d?.deliveryRate ?? 0);
  const rateColor = rate >= 90 ? '#22C55E' : rate >= 70 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات تسليم الإشعارات' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: rateColor }}>
          <Text style={{ fontSize: 48, fontWeight: '700', color: rateColor }}>{rate}%</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>معدل التسليم</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
          {[
            { label: 'مُرسَل', value: d?.totalSent ?? 0, color: c.brand },
            { label: 'مُسلَّم', value: d?.delivered ?? 0, color: '#22C55E' },
            { label: 'فشل', value: d?.failed ?? 0, color: '#EF4444' },
            { label: 'معلق', value: d?.pending ?? 0, color: '#F59E0B' },
          ].map(m => (
            <View key={m.label} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
