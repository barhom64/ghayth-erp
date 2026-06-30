import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface InboxMessage {
  id?: number;
  from?: string;
  subject?: string;
  channel?: string;
  receivedAt?: string;
  status?: string;
}

export default function AdminCommInboxScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<InboxMessage[]>('/api/admin/communication-control/inbox');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل صندوق الوارد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'صندوق وارد الاتصالات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="mail-outline" title="البريد الوارد فارغ" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>{item.subject ?? '—'}</Text>
              {item.receivedAt ? (
                <Text style={{ fontSize: 11, color: c.textMuted }}>
                  {new Date(item.receivedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {item.from ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.from}</Text> : null}
              {item.channel ? <Text style={{ fontSize: 11, color: c.brand }}>{item.channel}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
