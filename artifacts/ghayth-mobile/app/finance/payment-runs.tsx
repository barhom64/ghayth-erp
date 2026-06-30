import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PaymentRun {
  id: number;
  runNumber?: string;
  totalAmount?: number;
  vendorCount?: number;
  currency?: string;
  status?: string;
  scheduledDate?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function PaymentRunsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PaymentRun[]>('/api/payment-run');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل دفعات الدفع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'دفعات الدفع' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="barcode-outline" title="لا توجد دفعات دفع" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.runNumber ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.runNumber}</Text> : null}
              <View style={{ flex: 1 }} />
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.totalAmount != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>{item.totalAmount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
              {item.vendorCount != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.vendorCount} مورد</Text> : null}
              {item.scheduledDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.scheduledDate)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
