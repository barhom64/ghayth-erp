import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RoomBlock {
  id: number;
  hotelName?: string;
  roomType?: string;
  totalRooms?: number;
  bookedRooms?: number;
  checkIn?: string;
  checkOut?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function RoomBlocksScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RoomBlock[]>('/api/umrah-accommodation/room-blocks');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل كتل الغرف…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'كتل الغرف' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="grid-outline" title="لا توجد كتل غرف" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.hotelName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.roomType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.roomType}</Text> : null}
              {item.totalRooms != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.bookedRooms ?? 0}/{item.totalRooms} غرفة</Text> : null}
              {item.checkIn ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.checkIn)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
