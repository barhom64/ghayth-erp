import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DimensionalCoverageItem {
  dimension?: string;
  total?: number;
  covered?: number;
  pct?: number;
  period?: string;
}

export default function DimensionalCoverageScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DimensionalCoverageItem[]>('/api/journal-lines/dimensional-coverage');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تغطية الأبعاد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تغطية أبعاد القيود' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => item.dimension ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="layers-outline" title="لا توجد بيانات أبعاد" description="" />}
        renderItem={({ item }) => {
          const pct = item.pct ?? (item.total && item.covered ? (item.covered / item.total) * 100 : 0);
          const pctColor = pct >= 90 ? '#22C55E' : pct >= 70 ? '#F59E0B' : '#EF4444';
          return (
            <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.dimension ?? '—'}</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: pctColor }}>{pct.toFixed(1)}%</Text>
              </View>
              <View style={{ height: 6, backgroundColor: c.border, borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ height: 6, width: `${Math.min(pct, 100)}%` as never, backgroundColor: pctColor, borderRadius: 3 }} />
              </View>
              {item.covered != null && item.total != null ? (
                <Text style={{ fontSize: 10, color: c.textFaint, textAlign: 'right', marginTop: 4 }}>{item.covered} / {item.total}</Text>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}
