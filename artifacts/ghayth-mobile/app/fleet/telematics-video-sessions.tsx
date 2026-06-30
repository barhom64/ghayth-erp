import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface VideoSession {
  id?: number;
  status?: string;
  vehiclePlate?: string;
  channelNo?: number;
  streamType?: string;
  startedAt?: string;
  endedAt?: string;
  reason?: string;
}

export default function TelematicsVideoSessionsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<VideoSession[]>('/api/telematics/video/sessions');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل جلسات الفيديو…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const statusColor = (s?: string) => s === 'active' ? '#22C55E' : s === 'expired' ? '#EF4444' : '#9CA3AF';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'جلسات الفيديو' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="videocam-outline" title="لا توجد جلسات فيديو" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>
                {item.vehiclePlate ?? '—'} — قناة {item.channelNo ?? '—'}
              </Text>
              <Text style={{ fontSize: 11, color: statusColor(item.status) }}>{item.status ?? '—'}</Text>
            </View>
            {item.reason ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.reason}</Text>
            ) : null}
            {item.startedAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, textAlign: 'right' }}>
                {new Date(item.startedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
