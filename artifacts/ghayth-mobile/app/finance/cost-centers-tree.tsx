import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CostCenterNode {
  id?: number;
  code?: string;
  name?: string;
  parentId?: number | null;
  level?: number;
  childCount?: number;
}

export default function FinanceCostCentersTreeScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CostCenterNode[]>('/api/finance/cost-centers/tree');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل شجرة مراكز التكلفة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'شجرة مراكز التكلفة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="git-branch-outline" title="لا توجد مراكز تكلفة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14,
            paddingRight: 14 + (item.level ?? 0) * 12 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: item.level === 0 ? '700' : '400', color: c.text }}>{item.name ?? '—'}</Text>
              {item.code ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.code}</Text> : null}
            </View>
            {(item.childCount ?? 0) > 0 ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2, textAlign: 'right' }}>{item.childCount} فرع</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
