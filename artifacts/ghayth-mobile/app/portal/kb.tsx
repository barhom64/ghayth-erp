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
  updatedAt?: string;
}

export default function PortalKbScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<KbArticle[]>('/api/portal/kb');
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
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }} numberOfLines={1}>
              {item.title ?? '—'}
            </Text>
            {item.category ? (
              <Text style={{ fontSize: 12, color: c.brand, marginTop: 4, textAlign: 'right' }}>{item.category}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
