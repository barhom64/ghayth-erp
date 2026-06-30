/**
 * مخالفات الأسطول
 * GET /api/fleet/violations
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FleetViolation {
  id: number;
  vehiclePlate?: string;
  driverName?: string;
  violationType?: string;
  amount?: number;
  location?: string;
  occurredAt?: string;
  dueDate?: string;
  status?: string;
  costBearer?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

const BEARER_LABEL: Record<string, string> = {
  driver: 'السائق',
  company: 'الشركة',
  insurance: 'التأمين',
};

export default function FleetViolationsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FleetViolation[]>('/api/fleet/violations');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المخالفات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مخالفات الأسطول' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="shield-checkmark-outline" title="لا توجد مخالفات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>
                {item.vehiclePlate ?? '—'} — {item.violationType ?? '—'}
              </Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            {item.driverName ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>السائق: {item.driverName}</Text> : null}
            {item.location ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>الموقع: {item.location}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 6 }}>
              {item.amount != null ? (
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#EF4444' }}>
                  {item.amount.toLocaleString('ar-SA')} ر.س
                </Text>
              ) : null}
              {item.costBearer ? (
                <Text style={{ fontSize: 12, color: c.brand }}>على: {BEARER_LABEL[item.costBearer] ?? item.costBearer}</Text>
              ) : null}
              {item.occurredAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.occurredAt)}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
