import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AllocationResult {
  id?: number;
  ruleId?: number;
  ruleName?: string;
  period?: string;
  totalAllocated?: number;
  targetCount?: number;
  postedAt?: string;
}

function fmtDate(val?: string) {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function AllocationResultsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AllocationResult[]>('/api/allocation-results');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل نتائج التوزيع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نتائج توزيع التكاليف' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="pie-chart-outline" title="لا توجد نتائج توزيع" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.ruleName ?? `قاعدة #${item.ruleId}`}</Text>
              {item.period ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.period}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.totalAllocated != null ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>{item.totalAllocated.toLocaleString('ar-SA')} ر.س</Text> : null}
              {item.targetCount != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.targetCount} جهة</Text> : null}
              <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.postedAt)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
