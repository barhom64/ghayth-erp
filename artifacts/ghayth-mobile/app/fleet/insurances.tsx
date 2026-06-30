/**
 * تأمينات الأسطول
 * GET /api/fleet/insurances
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FleetInsurance {
  id: number;
  vehiclePlate?: string;
  provider?: string;
  policyNumber?: string;
  insuranceType?: string;
  premium?: number;
  currency?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function FleetInsurancesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<FleetInsurance[]>('/api/fleet/insurances');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التأمينات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تأمينات الأسطول' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="shield-checkmark-outline" title="لا توجد تأمينات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/fleet/insurance-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand, flex: 1, textAlign: 'right' }}>{item.vehiclePlate ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.provider ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.provider}</Text> : null}
              {item.insuranceType ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.insuranceType}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.premium != null ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>{item.premium.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
              {item.endDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>انتهاء: {fmtDate(item.endDate)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
