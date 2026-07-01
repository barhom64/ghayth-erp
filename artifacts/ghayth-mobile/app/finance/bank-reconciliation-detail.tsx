import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ReconciliationLine { id?: number; date?: string; description?: string; amount?: number; matched?: boolean; }

export default function BankReconciliationDetail() {
  const c = useColors();
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
  const { data, isLoading, isError, refetch } = useList<ReconciliationLine[]>(`/api/finance/bank-reconciliation/${batchId ?? ''}`);
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تفاصيل التسوية البنكية' }} />
      <FlatList
        data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="git-compare-outline" title="لا توجد سطور" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.description ?? '—'}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.date ? new Date(item.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</Text>
              <Text style={{ color: c.text, fontSize: 12 }}>{(item.amount ?? 0).toLocaleString('ar-SA')} ر.س</Text>
              <Text style={{ color: item.matched ? '#22c55e' : '#f59e0b', fontSize: 12 }}>{item.matched ? 'مطابق' : 'غير مطابق'}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
