import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface MyLoan {
  id?: number;
  amount?: number;
  remainingBalance?: number;
  status?: string;
  monthlyInstallment?: number;
  startDate?: string;
  purpose?: string;
}

export default function MyLoansScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<MyLoan[]>('/api/hr/loans/my');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل قروضي…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const statusLabel = (s?: string) => s === 'active' ? 'نشط' : s === 'settled' ? 'مسدّد' : s === 'pending' ? 'قيد المراجعة' : s ?? '—';
  const statusColor = (s?: string) => s === 'active' ? '#3B82F6' : s === 'settled' ? '#22C55E' : '#9CA3AF';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قروضي' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="barcode-outline" title="لا توجد قروض" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>
                {item.amount != null ? `${Number(item.amount).toLocaleString('ar-SA')} ر.س` : '—'}
              </Text>
              <Text style={{ fontSize: 11, color: statusColor(item.status) }}>{statusLabel(item.status)}</Text>
            </View>
            {item.remainingBalance != null ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>
                المتبقي: {Number(item.remainingBalance).toLocaleString('ar-SA')} ر.س
              </Text>
            ) : null}
            {item.monthlyInstallment != null ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2, textAlign: 'right' }}>
                القسط الشهري: {Number(item.monthlyInstallment).toLocaleString('ar-SA')} ر.س
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
