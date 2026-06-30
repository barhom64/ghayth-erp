import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FeedItem {
  id?: number;
  type?: string;
  content?: string;
  authorName?: string;
  createdAt?: string;
  likesCount?: number;
}

export default function WorkspaceFeedScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FeedItem[]>('/api/workspace/feed');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التغذية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تغذية مساحة العمل' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="newspaper-outline" title="لا توجد منشورات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.brand }}>{item.authorName ?? '—'}</Text>
              {item.createdAt ? (
                <Text style={{ fontSize: 11, color: c.textMuted }}>
                  {new Date(item.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              ) : null}
            </View>
            {item.content ? <Text style={{ fontSize: 13, color: c.text, lineHeight: 20 }}>{item.content}</Text> : null}
            {item.likesCount != null ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 8 }}>♥ {item.likesCount}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
