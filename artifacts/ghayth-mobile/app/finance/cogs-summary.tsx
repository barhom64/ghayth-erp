import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CogsSummary {
  totalCogs?: number;
  byProduct?: { productName: string; cogs: number }[];
  byClient?: { clientName: string; cogs: number }[];
}

export default function CogsSummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<CogsSummary>('/api/finance/reports/cogs-summary');
  const d = (data && !Array.isArray(data)) ? data as CogsSummary : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل ملخص تكلفة البضاعة…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص تكلفة البضاعة المباعة (COGS)' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16, marginBottom: 12 }}>
          <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>الإجمالي</Text>
          <Text style={{ fontSize: 24, fontWeight: '700', color: c.text, textAlign: 'right', marginTop: 4 }}>
            {d?.totalCogs != null ? Number(d.totalCogs).toLocaleString('ar-SA') : '—'} ر.س
          </Text>
        </View>
        {(d?.byProduct?.length ?? 0) > 0 ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right', marginBottom: 12 }}>حسب المنتج</Text>
            {d!.byProduct!.map((p, i) => (
              <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: i < d!.byProduct!.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
                <Text style={{ fontSize: 13, color: c.text, flex: 1 }} numberOfLines={1}>{p.productName}</Text>
                <Text style={{ fontSize: 13, color: c.textMuted }}>{Number(p.cogs).toLocaleString('ar-SA')} ر.س</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
