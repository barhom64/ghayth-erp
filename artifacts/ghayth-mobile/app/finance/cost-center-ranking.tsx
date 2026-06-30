import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CostCenterRank {
  rank?: number;
  costCenterName?: string;
  costCenterId?: number;
  netAmount?: number;
  revenue?: number;
  expenses?: number;
  currency?: string;
}

export default function CostCenterRankingScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CostCenterRank[]>('/api/cost-centers/ranking');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تصنيف مراكز التكلفة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تصنيف مراكز التكلفة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.costCenterId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="podium-outline" title="لا يوجد تصنيف" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.rank != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>#{item.rank}</Text> : null}
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.costCenterName ?? '—'}</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
              {item.revenue != null ? <Text style={{ fontSize: 11, color: '#22C55E' }}>إيراد: {item.revenue.toLocaleString('ar-SA')}</Text> : null}
              {item.expenses != null ? <Text style={{ fontSize: 11, color: '#EF4444' }}>مصروف: {item.expenses.toLocaleString('ar-SA')}</Text> : null}
              {item.netAmount != null ? <Text style={{ fontSize: 12, fontWeight: '700', color: (item.netAmount ?? 0) < 0 ? '#EF4444' : c.brand }}>{item.netAmount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
