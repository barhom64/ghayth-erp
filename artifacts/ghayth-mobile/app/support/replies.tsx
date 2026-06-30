import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SupportReply {
  id?: number;
  ticketRef?: string;
  authorName?: string;
  body?: string;
  createdAt?: string;
  isInternal?: boolean;
}

export default function SupportRepliesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SupportReply[]>('/api/support/replies');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الردود…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ردود الدعم' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="chatbubble-outline" title="لا توجد ردود" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.brand }}>{item.authorName ?? '—'}</Text>
              <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                {item.isInternal ? <Text style={{ fontSize: 10, color: '#F59E0B', backgroundColor: '#F59E0B22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>داخلي</Text> : null}
                {item.ticketRef ? <Text style={{ fontSize: 11, color: c.textMuted }}>#{item.ticketRef}</Text> : null}
              </View>
            </View>
            {item.body ? <Text style={{ fontSize: 12, color: c.text, lineHeight: 18 }} numberOfLines={3}>{item.body}</Text> : null}
            {item.createdAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>
                {new Date(item.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
