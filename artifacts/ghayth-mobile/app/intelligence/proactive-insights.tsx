import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ProactiveInsight { id?: number; title?: string; description?: string; category?: string; urgency?: string; createdAt?: string; }

export default function ProactiveInsights() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ProactiveInsight[]>('/api/me-insights/proactive-insights');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الرؤى الاستباقية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="eye-outline" title="لا توجد رؤى" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{item.title ?? ''}</Text>
            {!!item.description && <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 4 }}>{item.description}</Text>}
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {!!item.category && <Text style={{ color: c.textFaint, fontSize: 12 }}>{item.category}</Text>}
              {!!item.urgency && <Text style={{ color: c.brand, fontSize: 12 }}>{item.urgency}</Text>}
            </View>
          </View>
        )}
      />
    </View>
  );
}
