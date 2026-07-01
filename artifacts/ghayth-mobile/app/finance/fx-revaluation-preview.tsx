import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RevalEntry { currency?: string; balance?: number; revaluedBalance?: number; gainLoss?: number; }

export default function FxRevaluationPreview() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RevalEntry[]>('/api/finance/fx/revaluation/preview');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل معاينة إعادة التقييم…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'معاينة إعادة تقييم العملات' }} />
      <FlatList
        data={list} keyExtractor={(item, i) => item.currency ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="swap-horizontal-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{item.currency}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>الرصيد الحالي: {(item.balance ?? 0).toLocaleString('ar-SA')}</Text>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>بعد التقييم: {(item.revaluedBalance ?? 0).toLocaleString('ar-SA')}</Text>
              <Text style={{ color: (item.gainLoss ?? 0) >= 0 ? '#22c55e' : '#ef4444', fontSize: 12 }}>
                {(item.gainLoss ?? 0) >= 0 ? 'ربح' : 'خسارة'}: {Math.abs(item.gainLoss ?? 0).toLocaleString('ar-SA')} ر.س
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
