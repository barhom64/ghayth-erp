import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RentalPayment { id?: number; amount?: number; dueDate?: string; paidDate?: string; status?: string; }

export default function RentalPayments() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RentalPayment[]>('/api/fleet/rental-contracts/0/payments');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'دفعات عقد الإيجار' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cash-outline" title="لا توجد دفعات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: c.text, fontSize: 14 }}>{item.amount?.toLocaleString('ar-SA') ?? '—'} ر.س</Text>
              <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>استحقاق: {item.dueDate ? new Date(item.dueDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }) : '—'}</Text>
            </View>
            <Text style={{ color: item.status === 'paid' ? '#22c55e' : '#ef4444', fontSize: 12 }}>{item.status === 'paid' ? 'مدفوع' : 'معلق'}</Text>
          </View>
        )}
      />
    </View>
  );
}
