/**
 * خطط الرحلات
 * GET /api/transport/itineraries
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TransportItinerary {
  id: number;
  title?: string;
  vehiclePlate?: string;
  driverName?: string;
  departureDate?: string;
  returnDate?: string;
  stopCount?: number;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function TransportItinerariesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<TransportItinerary[]>('/api/transport/itineraries');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل خطط الرحلات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'خطط الرحلات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="layers-outline" title="لا توجد خطط رحلات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/transport/itinerary-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.vehiclePlate ? <Text style={{ fontSize: 12, color: c.brand }}>{item.vehiclePlate}</Text> : null}
              {item.driverName ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.driverName}</Text> : null}
              {item.stopCount != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.stopCount} محطة</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.departureDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.departureDate)}</Text> : null}
              {item.returnDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>العودة: {fmtDate(item.returnDate)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
