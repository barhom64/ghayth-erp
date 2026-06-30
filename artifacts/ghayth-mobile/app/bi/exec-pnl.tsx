import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PnlData {
  revenue?: number;
  expenses?: number;
  grossProfit?: number;
  netProfit?: number;
  profitMargin?: number;
  period?: string;
}

export default function ExecPnlScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<PnlData>('/api/exec-dashboard/unified-pnl');
  const d = (data && !Array.isArray(data)) ? data as PnlData : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقرير الأرباح…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const rows = [
    { label: 'الإيرادات', value: d?.revenue ?? 0, color: '#22C55E' },
    { label: 'المصروفات', value: d?.expenses ?? 0, color: '#EF4444' },
    { label: 'إجمالي الربح', value: d?.grossProfit ?? 0, color: c.brand },
    { label: 'صافي الربح', value: d?.netProfit ?? 0, color: (d?.netProfit ?? 0) >= 0 ? '#22C55E' : '#EF4444' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الأرباح والخسائر الموحّد' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        {d?.period ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center', marginBottom: 4 }}>{d.period}</Text> : null}
        {d?.profitMargin != null ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 4, borderTopWidth: 4, borderTopColor: (d.profitMargin >= 0 ? '#22C55E' : '#EF4444') }}>
            <Text style={{ fontSize: 48, fontWeight: '700', color: d.profitMargin >= 0 ? '#22C55E' : '#EF4444' }}>{Math.round(d.profitMargin)}%</Text>
            <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>هامش الربح</Text>
          </View>
        ) : null}
        {rows.map(r => (
          <View key={r.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{r.label}</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: r.color }}>{r.value.toLocaleString('ar-SA')} ر.س</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
