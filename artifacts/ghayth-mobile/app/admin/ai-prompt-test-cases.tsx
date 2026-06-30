import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TestCase { id?: number; description?: string; input?: string; expectedOutput?: string; status?: string; }

export default function AiPromptTestCasesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TestCase[]>('/api/admin/ai-governance/prompts/test/test-cases');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'حالات الاختبار' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="flask-outline" title="لا توجد حالات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.description ?? '-'}</Text>
            <Text style={{ color: item.status === 'pass' ? '#22c55e' : '#ef4444', fontSize: 12, marginTop: 4 }}>{item.status ?? '-'}</Text>
          </View>
        )}
      />
    </View>
  );
}
