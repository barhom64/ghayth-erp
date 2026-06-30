/**
 * الإقامات
 * GET /api/umrah/accommodations
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Accommodation {
  id: number;
  hotelName?: string;
  city?: string;
  checkIn?: string;
  checkOut?: string;
  roomType?: string;
  capacity?: number;
  bookedRooms?: number;
  status?: string;
  groupName?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function AccommodationsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Accommodation[]>('/api/umrah/accommodations');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الإقامات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الإقامات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="grid-outline" title="لا توجد إقامات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/umrah/accommodation-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.hotelName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.city ? <Text style={{ fontSize: 12, color: c.brand }}>{item.city}</Text> : null}
              {item.roomType ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.roomType}</Text> : null}
              {item.groupName ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.groupName}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.checkIn)} — {fmtDate(item.checkOut)}</Text>
              {item.bookedRooms != null && item.capacity != null ? (
                <Text style={{ fontSize: 11, color: c.textFaint }}>{item.bookedRooms}/{item.capacity} غرفة</Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
