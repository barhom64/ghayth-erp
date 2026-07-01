import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface InboxConversation { id?: number; subject?: string; status?: string; channel?: string; participantCount?: number; lastMessage?: string; createdAt?: string; }

export default function InboxConversationDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<InboxConversation>(`/api/inbox-conversations/${id ?? '0'}`);
  const d = (data && !Array.isArray(data)) ? data as InboxConversation : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const row = (label: string, value?: string | number) => value !== undefined ? (
    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 13 }}>{String(value)}</Text>
    </View>
  ) : null;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: d.subject ?? 'تفاصيل المحادثة' }} />
      {row('الموضوع', d.subject)}
      {row('الحالة', d.status)}
      {row('القناة', d.channel)}
      {row('المشاركون', d.participantCount)}
      {!!d.lastMessage && (
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginTop: 12 }}>
          <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>آخر رسالة</Text>
          <Text style={{ color: c.text, fontSize: 13 }}>{d.lastMessage}</Text>
        </View>
      )}
    </ScrollView>
  );
}
