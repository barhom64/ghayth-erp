import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DsoItem { period?: string; dso?: number; change?: number; }

export default function DsoTrendScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DsoItem[]>('/api/finance/dso-trend');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'اتجاه أيام المبيعات المستحقة' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.period ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="trending-up-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.period ?? ''}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {item.dso != null ? <Text style={{ color: c.brand, fontSize: 13 }}>DSO: {item.dso} يوم</Text> : null}
              {item.change != null ? <Text style={{ color: item.change >= 0 ? '#e53e3e' : '#38a169', fontSize: 12 }}>{item.change > 0 ? '+' : ''}{item.change}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
