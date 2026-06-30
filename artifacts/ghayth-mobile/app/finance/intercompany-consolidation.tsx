import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ConsolidationData {
  totalAssets?: number;
  totalLiabilities?: number;
  totalEquity?: number;
  eliminatedAmount?: number;
  entityCount?: number;
  period?: string;
}

export default function FinanceIntercompanyConsolidationScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<ConsolidationData>('/api/finance/intercompany/consolidation');
  const d = (data && !Array.isArray(data)) ? data as ConsolidationData : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل التوحيد…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التوحيد الداخلي' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {[
          { label: 'إجمالي الأصول', value: `${(d?.totalAssets ?? 0).toLocaleString('ar-SA')} ر.س` },
          { label: 'إجمالي الالتزامات', value: `${(d?.totalLiabilities ?? 0).toLocaleString('ar-SA')} ر.س` },
          { label: 'إجمالي حقوق الملكية', value: `${(d?.totalEquity ?? 0).toLocaleString('ar-SA')} ر.س` },
          { label: 'المبالغ المُحذفة', value: `${(d?.eliminatedAmount ?? 0).toLocaleString('ar-SA')} ر.س` },
          { label: 'عدد الكيانات', value: String(d?.entityCount ?? 0) },
          { label: 'الفترة', value: d?.period ?? '—' },
        ].map((row) => (
          <View key={row.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14,
            flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: c.textMuted }}>{row.label}</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }}>{row.value}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
