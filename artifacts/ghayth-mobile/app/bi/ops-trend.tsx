import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OpsTrendItem {
  period?: string;
  completedTasks?: number;
  pendingTasks?: number;
  avgCycleTime?: number;
  slaBreaches?: number;
}

export default function BiOpsTrendScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<OpsTrendItem[]>('/api/bi/operations/trend');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل اتجاه العمليات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'اتجاه العمليات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => item.period ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="trending-up-outline" title="لا توجد بيانات اتجاه" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right', marginBottom: 8 }}>{item.period ?? '—'}</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 16 }}>
              {item.completedTasks != null ? <Text style={{ fontSize: 12, color: '#22C55E' }}>مكتمل: {item.completedTasks}</Text> : null}
              {item.pendingTasks != null ? <Text style={{ fontSize: 12, color: '#F59E0B' }}>معلّق: {item.pendingTasks}</Text> : null}
              {item.slaBreaches != null ? <Text style={{ fontSize: 12, color: '#EF4444' }}>خرق SLA: {item.slaBreaches}</Text> : null}
            </View>
            {item.avgCycleTime != null ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, textAlign: 'right' }}>وقت الدورة: {item.avgCycleTime.toFixed(1)} يوم</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
