import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface InboxConversation {
  id?: number;
  subject?: string;
  senderName?: string;
  channel?: string;
  status?: string;
  lastMessage?: string;
  updatedAt?: string;
}

export default function CommsInboxConversationsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<InboxConversation[]>('/api/inbox-conversations');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المحادثات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'محادثات البريد الوارد' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="chatbubbles-outline" title="لا توجد محادثات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }} numberOfLines={1}>{item.subject ?? '—'}</Text>
              <GStatusBadge status={item.status ?? 'pending'} />
            </View>
            {item.senderName ? <Text style={{ fontSize: 12, color: c.brand }}>{item.senderName}</Text> : null}
            {item.channel ? <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{item.channel}</Text> : null}
            {item.lastMessage ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }} numberOfLines={2}>{item.lastMessage}</Text> : null}
            {item.updatedAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>
                {new Date(item.updatedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
