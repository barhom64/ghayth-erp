import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ScoringHistory { id?: number; period?: string; score?: number; rank?: number; category?: string; evaluatedAt?: string; }

export default function ScoringHistory() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ScoringHistory[]>('/api/employees/0/scoring/history');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجل تقييم الأداء' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="star-outline" title="لا يوجد سجل تقييم" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{item.period ?? ''}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {item.score !== undefined && <Text style={{ color: c.brand, fontSize: 16, fontWeight: '700' }}>{item.score}</Text>}
              {item.rank !== undefined && <Text style={{ color: c.textMuted, fontSize: 13 }}>الترتيب: #{item.rank}</Text>}
            </View>
            {!!item.category && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 4 }}>{item.category}</Text>}
          </View>
        )}
      />
    </View>
  );
}
