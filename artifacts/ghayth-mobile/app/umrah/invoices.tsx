/**
 * فواتير العمرة
 * GET /api/umrah/invoices
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UmrahInvoice {
  id: number;
  invoiceNumber?: string;
  pilgrimName?: string;
  groupName?: string;
  amount?: number;
  currency?: string;
  paidAmount?: number;
  issueDate?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function UmrahInvoicesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<UmrahInvoice[]>('/api/umrah/invoices');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الفواتير…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فواتير العمرة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="receipt-outline" title="لا توجد فواتير" description="" />}
        renderItem={({ item }) => {
          const remaining = (item.amount ?? 0) - (item.paidAmount ?? 0);
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/umrah/invoice-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.invoiceNumber ?? '—'}</Text>
                <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.pilgrimName ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              {item.groupName ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{item.groupName}</Text> : null}
              <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
                <Text style={{ fontSize: 12, color: c.textFaint }}>الإجمالي: {(item.amount ?? 0).toLocaleString('ar-SA')}</Text>
                {remaining > 0 ? <Text style={{ fontSize: 12, color: '#EF4444', fontWeight: '700' }}>المتبقي: {remaining.toLocaleString('ar-SA')}</Text> : null}
                {item.issueDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.issueDate)}</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
