/**
 * سلف الموردين
 * GET /api/finance/vendor-advances
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface VendorAdvance {
  id: number;
  referenceNumber?: string;
  vendorName?: string;
  amount?: number;
  currency?: string;
  paidDate?: string;
  appliedAmount?: number;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function VendorAdvancesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<VendorAdvance[]>('/api/finance/vendor-advances');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سلف الموردين…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سلف الموردين' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="wallet-outline" title="لا توجد سلف" description="" />}
        renderItem={({ item }) => {
          const remaining = (item.amount ?? 0) - (item.appliedAmount ?? 0);
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/finance/vendor-advance-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {item.referenceNumber ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.referenceNumber}</Text> : null}
                <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.vendorName ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
                {item.amount != null ? <Text style={{ fontSize: 12, color: c.textFaint }}>الإجمالي: {item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
                {remaining > 0 ? <Text style={{ fontSize: 12, color: '#EF4444', fontWeight: '700' }}>المتبقي: {remaining.toLocaleString('ar-SA')}</Text> : null}
                {item.paidDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.paidDate)}</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
