import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface InboxThread {
  id: number;
  channel?: string;
  address?: string;
  subject?: string;
  lastMessage?: string;
  unreadCount?: number;
  status?: string;
  updatedAt?: string;
}

const CHANNEL_COLOR: Record<string, string> = {
  whatsapp: '#25D366', email: '#3B82F6', sms: '#8B5CF6', pbx: '#F59E0B',
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function InboxThreadsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<InboxThread[]>('/api/inbox/threads');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المحادثات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'المحادثات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="chatbubbles-outline" title="لا توجد محادثات" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.channel ? (
                <Text style={{ fontSize: 11, color: CHANNEL_COLOR[item.channel] ?? c.textMuted, fontWeight: '600' }}>{item.channel}</Text>
              ) : null}
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }} numberOfLines={1}>{item.subject ?? item.address ?? '—'}</Text>
              {item.unreadCount ? <Text style={{ fontSize: 11, color: '#fff', backgroundColor: c.brand, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>{item.unreadCount}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.lastMessage ? <Text style={{ fontSize: 12, color: c.textMuted, flex: 1, textAlign: 'right' }} numberOfLines={1}>{item.lastMessage}</Text> : null}
              {item.updatedAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.updatedAt)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
