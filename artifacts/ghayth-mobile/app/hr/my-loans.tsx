import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface MyLoan {
  id?: number;
  amount?: number;
  remainingAmount?: number;
  currency?: string;
  purpose?: string;
  status?: string;
  monthlyInstallment?: number;
}

export default function HrMyLoansScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<MyLoan[]>('/api/hr/loans/my');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل قروضك…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قروضي' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cash-outline" title="لا توجد قروض" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.purpose ?? 'قرض'}</Text>
              {item.amount != null && (
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>
                  {item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
                </Text>
              )}
            </View>
            {item.remainingAmount != null ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>
                المتبقي: {item.remainingAmount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
              </Text>
            ) : null}
            {item.monthlyInstallment != null ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2, textAlign: 'right' }}>
                القسط الشهري: {item.monthlyInstallment.toLocaleString('ar-SA')}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
