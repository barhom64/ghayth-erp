/**
 * خطط الصيانة الوقائية
 * GET /api/fleet/preventive-plans
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PreventivePlan {
  id: number;
  vehiclePlate?: string;
  planName?: string;
  intervalKm?: number;
  intervalDays?: number;
  lastServiceKm?: number;
  nextDueDate?: string;
  isActive?: boolean;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function PreventivePlansScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PreventivePlan[]>('/api/fleet/preventive-plans');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل خطط الصيانة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'خطط الصيانة الوقائية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="build-outline" title="لا توجد خطط صيانة" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.vehiclePlate ?? '—'}</Text>
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.planName ?? '—'}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#94A3B8' }} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.intervalKm != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>كل {item.intervalKm.toLocaleString('ar-SA')} كم</Text> : null}
              {item.intervalDays != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>أو {item.intervalDays} يوم</Text> : null}
              {item.nextDueDate ? <Text style={{ fontSize: 11, color: c.brand }}>موعد: {fmtDate(item.nextDueDate)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
