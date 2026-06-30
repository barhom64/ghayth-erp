/**
 * مدفوعات العمرة
 * GET /api/umrah/payments
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UmrahPayment {
  id: number;
  receiptNumber?: string;
  pilgrimName?: string;
  groupName?: string;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  paymentDate?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function UmrahPaymentsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<UmrahPayment[]>('/api/umrah/payments');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المدفوعات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مدفوعات العمرة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="barcode-outline" title="لا توجد مدفوعات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/umrah/payment-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.receiptNumber ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.receiptNumber}</Text> : null}
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.pilgrimName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            {item.groupName ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{item.groupName}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.amount != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
              {item.paymentMethod ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.paymentMethod}</Text> : null}
              {item.paymentDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.paymentDate)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
