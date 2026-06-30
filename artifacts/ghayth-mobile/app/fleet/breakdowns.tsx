/**
 * أعطال المركبات
 * GET /api/fleet/breakdowns
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface VehicleBreakdown {
  id: number;
  vehiclePlate?: string;
  driverName?: string;
  breakdownType?: string;
  location?: string;
  status?: string;
  reportedAt?: string;
  resolvedAt?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function BreakdownsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<VehicleBreakdown[]>('/api/fleet/breakdowns');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الأعطال…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أعطال المركبات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="construct-outline" title="لا توجد أعطال" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.vehiclePlate ?? '—'}</Text>
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.driverName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.breakdownType ? <Text style={{ fontSize: 12, color: '#EF4444' }}>{item.breakdownType}</Text> : null}
              {item.location ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.location}</Text> : null}
            </View>
            {item.reportedAt ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 2 }}>بُلِّغ: {fmtDate(item.reportedAt)}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
