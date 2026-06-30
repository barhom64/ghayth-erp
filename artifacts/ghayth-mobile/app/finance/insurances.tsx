/**
 * التأمينات المالية
 * GET /api/finance/insurances
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FinanceInsurance {
  id: number;
  policyNumber?: string;
  provider?: string;
  insuranceType?: string;
  insuredAsset?: string;
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

export default function FinanceInsurancesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<FinanceInsurance[]>('/api/finance/insurances');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التأمينات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التأمينات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="shield-outline" title="لا توجد تأمينات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/finance/insurance-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.policyNumber ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.policyNumber}</Text> : null}
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.provider ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.insuranceType ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.insuranceType}</Text> : null}
              {item.insuredAsset ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.insuredAsset}</Text> : null}
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
