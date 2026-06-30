import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TransportCalendarEvent {
  id?: number;
  title?: string;
  type?: string;
  startTime?: string;
  endTime?: string;
  vehiclePlate?: string;
  driverName?: string;
}

export default function TransportCalendarEventsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TransportCalendarEvent[]>('/api/transport/calendar/events');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل أحداث التقويم…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أحداث تقويم النقل' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-outline" title="لا توجد أحداث" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.title ?? '—'}</Text>
              {item.type ? <Text style={{ fontSize: 12, color: c.brand }}>{item.type}</Text> : null}
            </View>
            {item.vehiclePlate ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.vehiclePlate}</Text> : null}
            {item.driverName ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.driverName}</Text> : null}
            {item.startTime ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>
                {new Date(item.startTime).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
