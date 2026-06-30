import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SeasonalPattern { id?: number; month?: string; pattern?: string; demandIndex?: number; category?: string; }

export default function SeasonalPatterns() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SeasonalPattern[]>('/api/intelligence/seasonal-patterns');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الأنماط الموسمية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="trending-up-outline" title="لا توجد بيانات موسمية" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{item.month ?? ''}</Text>
            {!!item.pattern && <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 2 }}>{item.pattern}</Text>}
            {item.demandIndex !== undefined && <Text style={{ color: c.brand, fontSize: 14, marginTop: 4 }}>مؤشر الطلب: {item.demandIndex}</Text>}
          </View>
        )}
      />
    </View>
  );
}
