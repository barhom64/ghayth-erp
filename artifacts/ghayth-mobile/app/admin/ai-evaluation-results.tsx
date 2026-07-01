import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EvaluationResult { id?: number; metric?: string; score?: number; passed?: boolean; notes?: string; }

export default function AiEvaluationResults() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<EvaluationResult[]>(`/api/admin/ai-governance/evaluations/${id ?? '0'}/results`);
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نتائج التقييم' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد نتائج" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.metric ?? ''}</Text>
              <Text style={{ color: item.passed ? '#22c55e' : '#ef4444', fontSize: 14, fontWeight: '700' }}>{item.score ?? '—'}</Text>
            </View>
            {!!item.notes && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{item.notes}</Text>}
          </View>
        )}
      />
    </View>
  );
}
