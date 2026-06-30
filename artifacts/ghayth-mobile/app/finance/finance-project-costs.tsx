import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CostEntry { id?: number; description?: string; amount?: number; category?: string; date?: string; }

export default function FinanceProjectCosts() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CostEntry[]>('/api/finance/projects/0/costs');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تكاليف المشروع المالي' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cash-outline" title="لا توجد تكاليف" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: c.text, fontSize: 14 }}>{item.description ?? '—'}</Text>
              <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.category ?? ''}</Text>
            </View>
            <Text style={{ color: c.brand, fontSize: 14, fontWeight: '600' }}>{item.amount?.toLocaleString('ar-SA') ?? '—'} ر.س</Text>
          </View>
        )}
      />
    </View>
  );
}
