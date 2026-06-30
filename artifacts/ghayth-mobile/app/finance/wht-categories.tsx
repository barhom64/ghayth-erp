import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface WhtCategory {
  id?: number;
  code?: string;
  name?: string;
  rate?: number;
  description?: string;
}

export default function WhtCategoriesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<WhtCategory[]>('/api/wht-categories');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل فئات ضريبة الاستقطاع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فئات ضريبة الاستقطاع WHT' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="pricetag-outline" title="لا توجد فئات WHT" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.name ?? '—'}</Text>
              {item.rate != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{(item.rate * 100).toFixed(1)}%</Text> : null}
            </View>
            {item.code ? <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right' }}>الكود: {item.code}</Text> : null}
            {item.description ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right' }}>{item.description}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
