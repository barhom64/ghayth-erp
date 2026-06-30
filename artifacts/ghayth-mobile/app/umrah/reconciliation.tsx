import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ReconciliationItem {
  agentId?: number;
  agentName?: string;
  expected?: number;
  received?: number;
  difference?: number;
  currency?: string;
}

export default function UmrahReconciliationScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ReconciliationItem[]>('/api/umrah/reports/reconciliation');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تسوية العمرة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تسوية العمرة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.agentId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="swap-horizontal-outline" title="لا توجد بيانات تسوية" description="" />}
        renderItem={({ item }) => {
          const diff = item.difference ?? 0;
          const diffColor = diff === 0 ? '#22C55E' : diff > 0 ? '#F59E0B' : '#EF4444';
          return (
            <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.agentName ?? `وكيل #${item.agentId}`}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: diffColor }}>{diff >= 0 ? '+' : ''}{diff.toLocaleString('ar-SA')}</Text>
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                {item.expected != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>متوقع: {item.expected.toLocaleString('ar-SA')}</Text> : null}
                {item.received != null ? <Text style={{ fontSize: 11, color: c.brand }}>مستلم: {item.received.toLocaleString('ar-SA')}</Text> : null}
                {item.currency ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.currency}</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
