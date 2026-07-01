import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OutboundItem { id?: number; recipient?: string; channel?: string; status?: string; createdAt?: string; }

export default function CommOutboundQueue() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<OutboundItem[]>('/api/admin/communication-control/outbound-queue');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل طابور الإرسال…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'طابور الإرسال الصادر' }} />
      <FlatList
        data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="send-outline" title="الطابور فارغ" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.recipient ?? '—'}</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.channel ?? ''}</Text>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.status ?? ''}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
