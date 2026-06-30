import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CommsStats {
  totalMessages?: number;
  sentToday?: number;
  deliveredCount?: number;
  failedCount?: number;
  pendingCount?: number;
  whatsappCount?: number;
  emailCount?: number;
  smsCount?: number;
  deliveryRate?: number;
  [key: string]: unknown;
}

export default function CommsStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<CommsStats>('/api/communications/stats');
  const d = (data && !Array.isArray(data)) ? data as CommsStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات الاتصالات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const rate = d?.deliveryRate ?? 0;
  const rateColor = rate >= 90 ? '#22C55E' : rate >= 70 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات الاتصالات' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: rateColor }}>
          <Text style={{ fontSize: 48, fontWeight: '700', color: rateColor }}>{rate}%</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>معدل التسليم</Text>
          <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 2 }}>{d?.deliveredCount ?? 0} من {d?.totalMessages ?? 0} رسالة</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'المرسلة اليوم', value: d?.sentToday ?? 0, color: c.brand },
            { label: 'في الانتظار', value: d?.pendingCount ?? 0, color: '#F59E0B' },
            { label: 'فشل الإرسال', value: d?.failedCount ?? 0, color: '#EF4444' },
            { label: 'واتساب', value: d?.whatsappCount ?? 0, color: '#22C55E' },
            { label: 'بريد إلكتروني', value: d?.emailCount ?? 0, color: '#3B82F6' },
            { label: 'رسائل SMS', value: d?.smsCount ?? 0, color: '#8B5CF6' },
          ].map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
