import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UmrahSeasonSummary {
  season?: string;
  totalGroups?: number;
  totalPilgrims?: number;
  totalRevenue?: number;
  totalCost?: number;
  netProfit?: number;
  avgGroupSize?: number;
  topAgent?: string;
  completedGroups?: number;
  cancelledGroups?: number;
  [key: string]: unknown;
}

export default function UmrahSeasonSummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<UmrahSeasonSummary>('/api/bi/reports/umrah-season-summary');
  const d = (data && !Array.isArray(data)) ? data as UmrahSeasonSummary : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل ملخص موسم العمرة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const profit = d?.netProfit ?? 0;
  const profitColor = profit >= 0 ? '#22C55E' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص موسم العمرة' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {d?.season ? (
          <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'right', fontWeight: '600' }}>الموسم: {d.season}</Text>
        ) : null}
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: profitColor }}>
          <Text style={{ fontSize: 36, fontWeight: '700', color: profitColor }}>{profit.toLocaleString('ar-SA')}</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>صافي الربح (ر.س)</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 26, fontWeight: '700', color: '#22C55E' }}>{(d?.totalRevenue ?? 0).toLocaleString('ar-SA')}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>إجمالي الإيراد</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 26, fontWeight: '700', color: '#EF4444' }}>{(d?.totalCost ?? 0).toLocaleString('ar-SA')}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>إجمالي التكلفة</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'إجمالي المجموعات', value: d?.totalGroups ?? 0, color: c.text },
            { label: 'إجمالي الحجاج', value: d?.totalPilgrims ?? 0, color: c.brand },
            { label: 'مجموعات مكتملة', value: d?.completedGroups ?? 0, color: '#22C55E' },
            { label: 'مجموعات ملغاة', value: d?.cancelledGroups ?? 0, color: '#EF4444' },
          ].map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {d?.topAgent ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, color: c.textMuted }}>أفضل وكيل</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{d.topAgent}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
