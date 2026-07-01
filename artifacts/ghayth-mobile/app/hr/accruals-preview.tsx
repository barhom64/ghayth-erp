import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AccrualItem { employeeId?: number; employeeName?: string; eosAmount?: number; leaveAmount?: number; period?: string; }

export default function AccrualsPreview() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AccrualItem[]>('/api/hr/accruals/preview');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل معاينة الاستحقاقات…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'معاينة الاستحقاقات' }} />
      <FlatList
        data={list} keyExtractor={(item, i) => String(item.employeeId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calculator-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.employeeName ?? '—'}</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>نهاية خدمة: {(item.eosAmount ?? 0).toLocaleString('ar-SA')} ر.س</Text>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>إجازة: {(item.leaveAmount ?? 0).toLocaleString('ar-SA')} ر.س</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
