import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AllocationOverrideLogItem {
  id?: number;
  journalLineId?: number;
  overriddenBy?: string;
  reason?: string;
  originalCostCenterId?: number;
  newCostCenterId?: number;
  createdAt?: string;
}

export default function FinanceAllocationOverrideLogScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AllocationOverrideLogItem[]>('/api/finance/allocation-override-log');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سجل تجاوزات التوزيع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجل تجاوزات التوزيع' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="list-outline" title="لا توجد تجاوزات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, textAlign: 'right' }}>
              {item.overriddenBy ?? '—'}
            </Text>
            {item.reason ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.reason}</Text> : null}
            {item.createdAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2, textAlign: 'right' }}>
                {new Date(item.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
