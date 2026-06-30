import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ScoringWeight {
  id?: number;
  dimension?: string;
  weight?: number;
  description?: string;
}

export default function OrgScoringWeightsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ScoringWeight[]>('/api/org/scoring-weights');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل أوزان التقييم…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أوزان التقييم' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        {list.length === 0 ? (
          <GEmptyState icon="bar-chart-outline" title="لا توجد أوزان" description="" />
        ) : list.map((item, i) => {
          const pct = Math.round((item.weight ?? 0) * 100);
          return (
            <View key={item.id ?? i} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.dimension ?? '—'}</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>{pct}%</Text>
              </View>
              <View style={{ height: 6, backgroundColor: c.border, borderRadius: 3 }}>
                <View style={{ height: 6, backgroundColor: c.brand, borderRadius: 3, width: `${Math.min(pct, 100)}%` as never }} />
              </View>
              {item.description ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 6 }}>{item.description}</Text> : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
