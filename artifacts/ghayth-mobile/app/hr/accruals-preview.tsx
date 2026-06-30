import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AccrualPreviewItem {
  employeeId?: number;
  employeeName?: string;
  eosAccrual?: number;
  leaveAccrual?: number;
  period?: string;
  currency?: string;
}

export default function AccrualsPreviewScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AccrualPreviewItem[]>('/api/accruals/preview');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل معاينة الاستحقاقات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'معاينة الاستحقاقات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.employeeId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calculator-outline" title="لا توجد استحقاقات" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.employeeName ?? '—'}</Text>
              {item.period ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.period}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.eosAccrual != null ? <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: c.textMuted }}>مكافأة نهاية خدمة</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>{item.eosAccrual.toLocaleString('ar-SA')}</Text>
              </View> : null}
              {item.leaveAccrual != null ? <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: c.textMuted }}>إجازة</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>{item.leaveAccrual.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text>
              </View> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
