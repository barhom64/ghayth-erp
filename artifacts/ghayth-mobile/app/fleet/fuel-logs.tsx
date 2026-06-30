/**
 * سجلات الوقود
 * GET /api/fleet/fuel-logs
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FuelLog {
  id: number;
  vehiclePlate?: string;
  driverName?: string;
  date?: string;
  liters?: number;
  costPerLiter?: number;
  totalCost?: number;
  currency?: string;
  odometer?: number;
  fuelType?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function FuelLogsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<FuelLog[]>('/api/fleet/fuel-logs');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سجلات الوقود…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجلات الوقود' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="water-outline" title="لا توجد سجلات وقود" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/fleet/fuel-log-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.vehiclePlate ?? '—'}</Text>
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.driverName ?? '—'}</Text>
              {item.date ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.date)}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.liters != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.liters} لتر</Text> : null}
              {item.totalCost != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.totalCost.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
              {item.fuelType ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.fuelType}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
