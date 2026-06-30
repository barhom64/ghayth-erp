/**
 * مخالفات المرور
 * GET /api/fleet/traffic-violations
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TrafficViolation {
  id: number;
  vehiclePlate?: string;
  driverName?: string;
  violationType?: string;
  fineAmount?: number;
  currency?: string;
  violationDate?: string;
  costBearer?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function TrafficViolationsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<TrafficViolation[]>('/api/fleet/traffic-violations');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل مخالفات المرور…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مخالفات المرور' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="car-outline" title="لا توجد مخالفات مرور" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/fleet/traffic-violation-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand, flex: 1, textAlign: 'right' }}>{item.vehiclePlate ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.violationType ? <Text style={{ fontSize: 12, color: '#EF4444' }}>{item.violationType}</Text> : null}
              {item.driverName ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.driverName}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.fineAmount != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>{item.fineAmount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
              {item.costBearer ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.costBearer}</Text> : null}
              {item.violationDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.violationDate)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
