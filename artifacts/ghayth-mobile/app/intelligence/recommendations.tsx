import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Recommendation { id?: number; title?: string; description?: string; score?: number; type?: string; }

export default function IntelligenceRecommendations() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Recommendation[]>('/api/intelligence/recommendations');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التوصيات الذكية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="star-outline" title="لا توجد توصيات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{item.title ?? ''}</Text>
            {!!item.description && <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 4 }}>{item.description}</Text>}
            {item.score !== undefined && <Text style={{ color: c.brand, fontSize: 13, marginTop: 4 }}>الدرجة: {item.score}</Text>}
          </View>
        )}
      />
    </View>
  );
}
