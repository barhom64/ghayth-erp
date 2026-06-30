import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DimensionalHealthItem {
  dimension?: string;
  entityType?: string;
  missingCount?: number;
  totalLines?: number;
  coveragePct?: number;
  [key: string]: unknown;
}

export default function DimensionalHealthScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DimensionalHealthItem[]>('/api/dimensional-routing/health');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل صحة التوجيه الأبعادي…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'صحة التوجيه الأبعادي' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => `${item.dimension}-${item.entityType}-${i}`}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="git-branch-outline" title="لا توجد بيانات صحة أبعادية" description="" />}
        renderItem={({ item }) => {
          const pct = item.coveragePct ?? 0;
          const color = pct >= 90 ? '#22C55E' : pct >= 70 ? '#F59E0B' : '#EF4444';
          return (
            <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.dimension ?? '—'}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color }}>{pct.toFixed(0)}%</Text>
              </View>
              {item.entityType ? <Text style={{ fontSize: 11, color: c.brand, textAlign: 'right', marginBottom: 4 }}>{item.entityType}</Text> : null}
              <View style={{ height: 4, backgroundColor: c.border, borderRadius: 2 }}>
                <View style={{ height: 4, backgroundColor: color, borderRadius: 2, width: `${Math.min(pct, 100)}%` as never }} />
              </View>
              {item.missingCount != null ? (
                <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 4 }}>
                  {item.missingCount} سطر ناقص من {item.totalLines}
                </Text>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}
