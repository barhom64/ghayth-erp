import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AiEvaluation { id?: number; model?: string; status?: string; score?: number; createdAt?: string; prompt?: string; }

export default function AiEvaluations() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AiEvaluation[]>('/api/admin/ai-governance/evaluations');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقييمات الذكاء الاصطناعي' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="hardware-chip-outline" title="لا توجد تقييمات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.model ?? String(item.id ?? '')}</Text>
              {item.score !== undefined && <Text style={{ color: c.brand, fontSize: 14, fontWeight: '700' }}>{item.score}</Text>}
            </View>
            {!!item.status && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.status}</Text>}
            {!!item.createdAt && <Text style={{ color: c.textMuted, fontSize: 11, marginTop: 2 }}>{new Date(item.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
          </View>
        )}
      />
    </View>
  );
}
