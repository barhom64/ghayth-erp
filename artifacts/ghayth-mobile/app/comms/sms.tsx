/**
 * الرسائل القصيرة SMS
 * GET /api/communications/sms
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SmsMessage {
  id: number;
  to?: string;
  body?: string;
  status?: string;
  provider?: string;
  createdAt?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function SmsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SmsMessage[]>('/api/communications/sms');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الرسائل القصيرة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الرسائل القصيرة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="chatbox-outline" title="لا توجد رسائل" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.to ?? '—'}</Text>
              <View style={{ flex: 1 }} />
              <GStatusBadge status={item.status ?? ''} />
            </View>
            {item.body ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginBottom: 4 }} numberOfLines={2}>{item.body}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.provider ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.provider}</Text> : null}
              {item.createdAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.createdAt)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
