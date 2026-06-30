/**
 * حوادث المركبات
 * GET /api/fleet/accidents
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FleetAccident {
  id: number;
  vehiclePlate?: string;
  driverName?: string;
  accidentType?: string;
  severity?: string;
  location?: string;
  repairCost?: number;
  currency?: string;
  status?: string;
  accidentDate?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

const SEVERITY_COLOR: Record<string, string> = {
  minor: '#F59E0B',
  moderate: '#F97316',
  major: '#EF4444',
  total_loss: '#7F1D1D',
};

export default function AccidentsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FleetAccident[]>('/api/fleet/accidents');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الحوادث…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'حوادث المركبات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="warning-outline" title="لا توجد حوادث" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.vehiclePlate ?? '—'}</Text>
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.driverName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 4 }}>
              {item.severity ? (
                <View style={{ height: 4, width: 40, borderRadius: 2, backgroundColor: SEVERITY_COLOR[item.severity] ?? '#94A3B8' }} />
              ) : null}
              {item.accidentType ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.accidentType}</Text> : null}
              {item.accidentDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.accidentDate)}</Text> : null}
            </View>
            {item.repairCost != null ? (
              <Text style={{ fontSize: 12, color: '#EF4444', textAlign: 'right' }}>
                تكلفة الإصلاح: {item.repairCost.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}
