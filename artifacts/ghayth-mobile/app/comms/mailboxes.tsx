/**
 * صناديق البريد
 * GET /api/mailboxes
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Mailbox {
  id: number;
  name?: string;
  email?: string;
  provider?: string;
  status?: string;
  unreadCount?: number;
  branchName?: string;
}

export default function MailboxesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Mailbox[]>('/api/mailboxes');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل صناديق البريد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'صناديق البريد' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="mail-outline" title="لا توجد صناديق بريد" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              {item.unreadCount != null && item.unreadCount > 0 ? (
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: c.brand }}>
                  <Text style={{ fontSize: 11, color: '#fff', fontWeight: '700' }}>{item.unreadCount}</Text>
                </View>
              ) : null}
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.email ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.email}</Text> : null}
              {item.provider ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.provider}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
