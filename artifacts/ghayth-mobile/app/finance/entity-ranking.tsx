import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EntityRankingItem {
  entityType?: string;
  entityId?: number;
  entityName?: string;
  revenue?: number;
  cost?: number;
  pnl?: number;
  currency?: string;
  rank?: number;
}

export default function EntityRankingScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<EntityRankingItem[]>('/api/entity-ranking');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تصنيف الكيانات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تصنيف الكيانات ربحيةً' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => `${item.entityType}-${item.entityId ?? i}`}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bar-chart-outline" title="لا توجد بيانات تصنيف" description="" />}
        renderItem={({ item, index }) => {
          const pnl = item.pnl ?? 0;
          const pnlColor = pnl >= 0 ? '#22C55E' : '#EF4444';
          return (
            <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: c.brand, fontWeight: '700', minWidth: 24 }}>#{item.rank ?? index + 1}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.entityName ?? `${item.entityType} #${item.entityId}`}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: pnlColor }}>{pnl >= 0 ? '+' : ''}{pnl.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text>
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                {item.entityType ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.entityType}</Text> : null}
                {item.revenue != null ? <Text style={{ fontSize: 11, color: '#22C55E' }}>إيراد: {item.revenue.toLocaleString('ar-SA')}</Text> : null}
                {item.cost != null ? <Text style={{ fontSize: 11, color: '#EF4444' }}>تكلفة: {item.cost.toLocaleString('ar-SA')}</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
