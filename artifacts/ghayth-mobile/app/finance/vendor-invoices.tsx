/**
 * فواتير الموردين
 * GET /api/finance/vendor-invoices
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface VendorInvoice {
  id: number;
  invoiceNumber?: string;
  vendorName?: string;
  amount?: number;
  currency?: string;
  invoiceDate?: string;
  dueDate?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function VendorInvoicesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<VendorInvoice[]>('/api/finance/vendor-invoices');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل فواتير الموردين…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فواتير الموردين' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="receipt-outline" title="لا توجد فواتير موردين" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/finance/vendor-invoice-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.invoiceNumber ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <Text style={{ fontSize: 13, color: c.brand, textAlign: 'right', marginBottom: 4 }}>{item.vendorName ?? '—'}</Text>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', marginBottom: 4 }}>
              {(item.amount ?? 0).toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
            </Text>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              <Text style={{ fontSize: 11, color: c.textMuted }}>إصدار: {fmtDate(item.invoiceDate)}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted }}>استحقاق: {fmtDate(item.dueDate)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
