import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Comment { id?: number; content?: string; createdAt?: string; authorName?: string; }

export default function EntityComments() {
  const c = useColors();
  const { entityType, entityId } = useLocalSearchParams<{ entityType: string; entityId: string }>();
  const { data, isLoading, isError, refetch } = useList<Comment[]>(`/api/entity-meta/comments/${entityType ?? ''}/${entityId ?? ''}`);
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل التعليقات…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التعليقات' }} />
      <FlatList
        data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="chatbubble-outline" title="لا توجد تعليقات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.authorName ?? '—'} · {item.createdAt ? new Date(item.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</Text>
            <Text style={{ color: c.text, fontSize: 14, marginTop: 4 }}>{item.content ?? '—'}</Text>
          </View>
        )}
      />
    </View>
  );
}
