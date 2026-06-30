import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EvaluationHistory {
  id?: number;
  cycleName?: string;
  score?: number;
  grade?: string;
  period?: string;
  evaluatorName?: string;
  status?: string;
}

export default function EvaluationHistoryScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<EvaluationHistory[]>('/api/hr/employees/0/evaluation-history');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سجل التقييمات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجل تقييمات الأداء' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="star-half-outline" title="لا يوجد سجل تقييمات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>{item.cycleName ?? '—'}</Text>
              {item.score != null ? (
                <Text style={{ fontSize: 13, color: c.brand, fontWeight: '600' }}>{Number(item.score).toFixed(1)}</Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              {item.grade ? (
                <Text style={{ fontSize: 12, color: c.textMuted }}>التقدير: {item.grade}</Text>
              ) : null}
              {item.period ? (
                <Text style={{ fontSize: 12, color: c.textMuted }}>الفترة: {item.period}</Text>
              ) : null}
              {item.evaluatorName ? (
                <Text style={{ fontSize: 12, color: c.textMuted }}>{item.evaluatorName}</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
