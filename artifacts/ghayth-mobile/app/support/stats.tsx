import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SupportStats {
  totalTickets?: number;
  openTickets?: number;
  resolvedTickets?: number;
  slaBreach?: number;
  avgResolutionHours?: string;
  avgFirstResponseHours?: string;
  csatAvg?: string | null;
  csatTotal?: number;
  [key: string]: unknown;
}

export default function SupportStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<SupportStats>('/api/support/stats');
  const d = (data && !Array.isArray(data)) ? data as SupportStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات الدعم…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const csat = parseFloat(d?.csatAvg ?? '0');
  const csatColor = csat >= 4 ? '#22C55E' : csat >= 3 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات الدعم' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {d?.csatAvg ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: csatColor }}>
            <Text style={{ fontSize: 48, fontWeight: '700', color: csatColor }}>{d.csatAvg}</Text>
            <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 4 }}>متوسط رضا العملاء / 5</Text>
            <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2 }}>{d.csatTotal} تقييم</Text>
          </View>
        ) : null}
        {/* Ticket counts */}
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 }}>
          {[
            { label: 'إجمالي', value: d?.totalTickets ?? 0, color: c.text },
            { label: 'مفتوحة', value: d?.openTickets ?? 0, color: '#F59E0B' },
            { label: 'محلولة', value: d?.resolvedTickets ?? 0, color: '#22C55E' },
            { label: 'تجاوز SLA', value: d?.slaBreach ?? 0, color: (d?.slaBreach ?? 0) > 0 ? '#EF4444' : c.text },
          ].map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {/* Response times */}
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 8 }}>أوقات الاستجابة</Text>
          <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, color: c.textMuted }}>متوسط وقت الحل</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: c.text }}>{d?.avgResolutionHours ?? '—'} ساعة</Text>
          </View>
          <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, color: c.textMuted }}>متوسط أول رد</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>{d?.avgFirstResponseHours ?? '—'} ساعة</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
