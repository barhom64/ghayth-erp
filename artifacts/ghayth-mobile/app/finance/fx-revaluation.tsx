import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FxRevaluation {
  id?: number;
  period?: string;
  currency?: string;
  gainLoss?: number;
  status?: string;
  postedAt?: string;
}

export default function FxRevaluationScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FxRevaluation[]>('/api/finance/fx/revaluation');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل إعادة تقييم العملات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إعادة تقييم العملات الأجنبية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="swap-horizontal-outline" title="لا توجد عمليات إعادة تقييم" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.period ?? '—'} — {item.currency ?? ''}</Text>
              {item.gainLoss != null ? (
                <Text style={{ fontSize: 13, color: Number(item.gainLoss) >= 0 ? '#22C55E' : '#EF4444', fontWeight: '600' }}>
                  {Number(item.gainLoss) >= 0 ? '+' : ''}{Number(item.gainLoss).toLocaleString('ar-SA')} ر.س
                </Text>
              ) : null}
            </View>
            {item.postedAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, textAlign: 'right' }}>
                {new Date(item.postedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
