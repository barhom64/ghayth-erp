import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CostItem { id?: number; category?: string; amount?: number; currency?: string; }

export default function GroupCostBreakdown() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CostItem[]>('/api/umrah/groups/0/cost-breakdown');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تفصيل تكاليف المجموعة' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cash-outline" title="لا توجد بنود تكلفة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.category ?? '—'}</Text>
            <Text style={{ color: c.brand, fontSize: 14, fontWeight: '600' }}>{item.amount?.toLocaleString('ar-SA') ?? '—'} {item.currency ?? 'ر.س'}</Text>
          </View>
        )}
      />
    </View>
  );
}
