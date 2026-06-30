import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AmortizationSchedule {
  id: number;
  assetName?: string;
  totalAmount?: number;
  amortizedAmount?: number;
  remainingAmount?: number;
  currency?: string;
  status?: string;
  endDate?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function AmortizationScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AmortizationSchedule[]>('/api/amortization/schedules');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل جداول الإطفاء…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'جداول الإطفاء' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="trending-down-outline" title="لا توجد جداول إطفاء" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.assetName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.amortizedAmount != null ? <Text style={{ fontSize: 12, color: '#22C55E' }}>مُطفأ: {item.amortizedAmount.toLocaleString('ar-SA')}</Text> : null}
              {item.remainingAmount != null ? <Text style={{ fontSize: 12, color: '#EF4444' }}>متبقٍّ: {item.remainingAmount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
              {item.endDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.endDate)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
