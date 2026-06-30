/**
 * صندوق الوارد
 * GET /api/inbox/threads
 */
import React, { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface InboxThread {
  id: number;
  subject?: string;
  from?: string;
  channel?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  isRead?: boolean;
  status?: string;
  assignedTo?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

const CHANNEL_ICON: Record<string, string> = {
  email: 'mail-outline',
  whatsapp: 'logo-whatsapp',
  sms: 'chatbubble-outline',
  phone: 'call-outline',
  portal: 'globe-outline',
  internal: 'people-outline',
};

export default function InboxScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<InboxThread[]>('/api/inbox/threads');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الوارد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'صندوق الوارد' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="mail-open-outline" title="لا توجد رسائل" description="" />}
        renderItem={({ item }) => {
          const isUnread = !item.isRead || (item.unreadCount ?? 0) > 0;
          return (
            <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.brand + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={(CHANNEL_ICON[item.channel ?? ''] ?? 'chatbubble-outline') as never} size={18} color={c.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 14, fontWeight: isUnread ? '700' : '500', color: c.text, flex: 1, textAlign: 'right' }} numberOfLines={1}>
                    {item.subject ?? '—'}
                  </Text>
                  {(item.unreadCount ?? 0) > 0 ? (
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>{item.unreadCount}</Text>
                    </View>
                  ) : null}
                </View>
                {item.from ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{item.from}</Text> : null}
                {item.lastMessage ? (
                  <Text style={{ fontSize: 12, color: c.textFaint, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>{item.lastMessage}</Text>
                ) : null}
                <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 4 }}>{fmtDate(item.lastMessageAt)}</Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
