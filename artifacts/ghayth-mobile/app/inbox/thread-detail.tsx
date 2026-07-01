import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ThreadMessage { id?: number; from?: string; subject?: string; body?: string; date?: string; }

export default function InboxThreadDetail() {
  const c = useColors();
  const { channel, address } = useLocalSearchParams<{ channel: string; address: string }>();
  const { data, isLoading, isError, refetch } = useList<ThreadMessage[]>(`/api/inbox/threads/${channel ?? ''}/${address ?? ''}`);
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل المحادثة…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: address ?? 'تفاصيل المحادثة' }} />
      <FlatList
        data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="mail-outline" title="لا توجد رسائل" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.from ?? '—'}</Text>
            <Text style={{ color: c.text, fontSize: 14, marginTop: 2 }}>{item.subject ?? '—'}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }} numberOfLines={2}>{item.body ?? ''}</Text>
          </View>
        )}
      />
    </View>
  );
}
