import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CallLog { id?: number; caller?: string; direction?: string; duration?: number; createdAt?: string; }

export default function InboxCalls() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CallLog[]>('/api/inbox/calls');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجل المكالمات' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="call-outline" title="لا توجد مكالمات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.caller ?? '—'}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.direction === 'inbound' ? 'واردة' : 'صادرة'} · {item.duration ?? 0}ث</Text>
          </View>
        )}
      />
    </View>
  );
}
