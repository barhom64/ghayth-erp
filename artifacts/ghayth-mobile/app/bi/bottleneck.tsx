import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Bottleneck { stage?: string; avgWaitHours?: number; pendingCount?: number; impact?: string; }

export default function BottleneckScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Bottleneck[]>('/api/bi/operations/bottleneck');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نقاط الاختناق' }} />
      <FlatList data={list} keyExtractor={(item, i) => `${item.stage}-${i}`}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="analytics-outline" title="لا توجد اختناقات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.stage ?? '-'}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>متوسط الانتظار: {item.avgWaitHours ?? 0}h | معلّق: {item.pendingCount ?? 0}</Text>
          </View>
        )}
      />
    </View>
  );
}
