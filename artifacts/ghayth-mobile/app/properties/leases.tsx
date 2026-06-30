/**
 * عقود الإيجار
 * GET /api/properties/leases
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Lease {
  id: number;
  contractNumber?: string;
  tenantName?: string;
  propertyName?: string;
  unitNumber?: string;
  rentAmount?: number;
  paymentFrequency?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  daysToExpiry?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function PropertyLeasesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Lease[]>('/api/properties/leases');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل عقود الإيجار…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'عقود الإيجار' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد عقود إيجار" description="" />}
        renderItem={({ item }) => {
          const expiring = (item.daysToExpiry ?? Infinity) <= 30;
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/properties/contract-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>
                  {item.propertyName ?? '—'}{item.unitNumber ? ` — ${item.unitNumber}` : ''}
                </Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              {item.tenantName ? <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'right' }}>{item.tenantName}</Text> : null}
              <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 6 }}>
                {item.rentAmount != null ? (
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>
                    {item.rentAmount.toLocaleString('ar-SA')} ر.س/{item.paymentFrequency ?? 'سنة'}
                  </Text>
                ) : null}
                <Text style={{ fontSize: 11, color: expiring ? '#EF4444' : c.textFaint }}>
                  {expiring ? `⚠ ينتهي بعد ${item.daysToExpiry} يوم` : fmtDate(item.endDate)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
