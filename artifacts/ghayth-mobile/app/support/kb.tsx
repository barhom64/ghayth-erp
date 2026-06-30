import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface KbArticle {
  id?: number;
  title?: string;
  category?: string;
  views?: number;
  helpful?: number;
  updatedAt?: string;
}

export default function SupportKbScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<KbArticle[]>('/api/support/kb');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل قاعدة المعرفة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قاعدة المعرفة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="book-outline" title="لا توجد مقالات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.title ?? '—'}</Text>
            {item.category ? <Text style={{ fontSize: 12, color: c.brand, marginTop: 2 }}>{item.category}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 6 }}>
              {item.views != null ? <Text style={{ fontSize: 11, color: c.textFaint }}>👁 {item.views}</Text> : null}
              {item.helpful != null ? <Text style={{ fontSize: 11, color: '#22C55E' }}>👍 {item.helpful}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
