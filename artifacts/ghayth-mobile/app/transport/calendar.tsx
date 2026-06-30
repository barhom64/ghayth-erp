import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TransportEvent {
  id?: number;
  title?: string;
  type?: string;
  vehicleNumber?: string;
  driverName?: string;
  startAt?: string;
  endAt?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

export default function TransportCalendarScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TransportEvent[]>('/api/transport/calendar/events');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقويم النقل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقويم النقل' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-outline" title="لا توجد أحداث نقل" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.vehicleNumber ? <Text style={{ fontSize: 11, color: c.brand }}>{item.vehicleNumber}</Text> : null}
              {item.driverName ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.driverName}</Text> : null}
              {item.startAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.startAt)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
