import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FunnelStage {
  stage?: string;
  count?: number;
  conversionRate?: number;
  revenue?: number;
}

export default function MarketingFunnelScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FunnelStage[]>('/api/marketing/funnel');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل مسار التسويق…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const maxCount = Math.max(...list.map(s => s.count ?? 0), 1);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'مسار التسويق' }} />
      {list.map((stage, i) => {
        const pct = ((stage.count ?? 0) / maxCount) * 100;
        return (
          <View key={i} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{stage.stage ?? '—'}</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{stage.count ?? 0}</Text>
            </View>
            <View style={{ height: 6, backgroundColor: c.border, borderRadius: 3, marginBottom: 4 }}>
              <View style={{ height: 6, backgroundColor: c.brand, borderRadius: 3, width: `${pct}%` as never }} />
            </View>
            {stage.conversionRate != null ? (
              <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right' }}>معدل التحويل: {stage.conversionRate}%</Text>
            ) : null}
          </View>
        );
      })}
      {list.length === 0 ? <GEmptyState icon="funnel-outline" title="لا توجد بيانات مسار" description="" /> : null}
    </ScrollView>
  );
}
