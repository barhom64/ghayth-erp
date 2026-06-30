import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface InventoryCount {
  id?: number;
  reference?: string;
  warehouseName?: string;
  status?: string;
  itemsCount?: number;
  varianceCount?: number;
  date?: string;
  completedAt?: string | null;
}

export default function InventoryCountsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<InventoryCount[]>('/api/warehouse/inventory-counts');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل عدادات الجرد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'عدادات الجرد' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="clipboard-outline" title="لا توجد عمليات جرد" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.reference ?? '—'}</Text>
              <GStatusBadge status={item.status ?? 'pending'} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.warehouseName ? <Text style={{ fontSize: 11, color: c.brand }}>{item.warehouseName}</Text> : null}
              <Text style={{ fontSize: 11, color: c.textMuted }}>أصناف: {item.itemsCount ?? 0}</Text>
              {(item.varianceCount ?? 0) > 0 ? (
                <Text style={{ fontSize: 11, color: '#EF4444' }}>فروق: {item.varianceCount}</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
