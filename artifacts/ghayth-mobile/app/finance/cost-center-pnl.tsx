import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CostCenterPnl {
  costCenterName?: string;
  revenue?: number;
  expense?: number;
  profit?: number;
  margin?: number;
  period?: string;
}

export default function CostCenterPnlScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<CostCenterPnl>('/api/finance/cost-centers/0/pnl');
  const d = (data && !Array.isArray(data)) ? data as CostCenterPnl : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل الأرباح والخسائر…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ربحية مركز التكلفة' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 12 }}>
            {d?.costCenterName ?? 'مركز التكلفة'}
          </Text>
          {[
            { label: 'الإيراد', value: `${Number(d?.revenue ?? 0).toLocaleString('ar-SA')} ر.س`, color: '#22C55E' },
            { label: 'المصاريف', value: `${Number(d?.expense ?? 0).toLocaleString('ar-SA')} ر.س`, color: '#EF4444' },
            { label: 'صافي الربح', value: `${Number(d?.profit ?? 0).toLocaleString('ar-SA')} ر.س`, color: (d?.profit ?? 0) >= 0 ? '#22C55E' : '#EF4444' },
            { label: 'هامش الربح', value: d?.margin != null ? `${Number(d.margin).toFixed(1)}%` : '—', color: c.brand },
          ].map((row, i, arr) => (
            <View key={row.label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
              <Text style={{ fontSize: 14, color: c.text }}>{row.label}</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: row.color }}>{row.value}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
