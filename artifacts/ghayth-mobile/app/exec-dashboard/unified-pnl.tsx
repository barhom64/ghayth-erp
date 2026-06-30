import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UnifiedPnl {
  revenue?: number;
  cogs?: number;
  grossProfit?: number;
  operatingExpenses?: number;
  operatingProfit?: number;
  netProfit?: number;
  byCompany?: { companyName: string; revenue: number; netProfit: number }[];
}

export default function UnifiedPnlScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<UnifiedPnl>('/api/exec-dashboard/unified-pnl');
  const d = (data && !Array.isArray(data)) ? data as UnifiedPnl : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل الأرباح والخسائر الموحّدة…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const row = (label: string, val?: number, accent?: string) => (
    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Text style={{ fontSize: 13, color: c.text }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: accent ?? c.text }}>
        {val != null ? Number(val).toLocaleString('ar-SA') : '—'} ر.س
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الأرباح والخسائر الموحّدة' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16, marginBottom: 12 }}>
          {row('الإيرادات', d?.revenue, '#22C55E')}
          {row('تكلفة البضاعة', d?.cogs)}
          {row('إجمالي الربح', d?.grossProfit, d?.grossProfit != null && d.grossProfit >= 0 ? '#22C55E' : '#EF4444')}
          {row('مصاريف التشغيل', d?.operatingExpenses)}
          {row('ربح التشغيل', d?.operatingProfit, d?.operatingProfit != null && d.operatingProfit >= 0 ? '#22C55E' : '#EF4444')}
          {row('صافي الربح', d?.netProfit, d?.netProfit != null && d.netProfit >= 0 ? '#22C55E' : '#EF4444')}
        </View>
        {(d?.byCompany?.length ?? 0) > 0 ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right', marginBottom: 8 }}>حسب الشركة</Text>
            {d!.byCompany!.map((co, i) => (
              <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: i < d!.byCompany!.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
                <Text style={{ fontSize: 13, color: c.text, flex: 1 }} numberOfLines={1}>{co.companyName}</Text>
                <Text style={{ fontSize: 13, color: co.netProfit >= 0 ? '#22C55E' : '#EF4444', fontWeight: '600' }}>
                  {Number(co.netProfit).toLocaleString('ar-SA')} ر.س
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
