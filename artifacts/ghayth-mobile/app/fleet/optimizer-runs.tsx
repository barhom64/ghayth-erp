import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OptimizerRun {
  id: number;
  runType?: string;
  vehicleCount?: number;
  orderCount?: number;
  status?: string;
  createdAt?: string;
  savingsKm?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function OptimizerRunsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<OptimizerRun[]>('/api/fleet/optimizer/runs');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تشغيلات المُحسِّن…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تشغيلات المُحسِّن' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="git-branch-outline" title="لا توجد تشغيلات محسِّن" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.runType ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.runType}</Text> : null}
              <View style={{ flex: 1 }} />
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.vehicleCount != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.vehicleCount} مركبة</Text> : null}
              {item.orderCount != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.orderCount} طلب</Text> : null}
              {item.savingsKm != null ? <Text style={{ fontSize: 11, color: '#22C55E' }}>وفر {item.savingsKm} كم</Text> : null}
              {item.createdAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.createdAt)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
