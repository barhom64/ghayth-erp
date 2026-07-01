import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FiscalPeriod { id?: number; name?: string; startDate?: string; endDate?: string; status?: string; }

export default function FiscalPeriodsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FiscalPeriod[]>('/api/finance/fiscal-periods-v2');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الفترات المحاسبية' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-number-outline" title="لا توجد فترات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ color: c.text, fontSize: 14 }}>{item.name ?? String(item.id ?? '')}</Text>
              {(!!item.startDate || !!item.endDate) && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 2 }}>{item.startDate ?? ''} — {item.endDate ?? ''}</Text>}
            </View>
            {!!item.status && <Text style={{ color: item.status === 'open' ? c.brand : c.textMuted, fontSize: 12 }}>{item.status === 'open' ? 'مفتوحة' : 'مغلقة'}</Text>}
          </View>
        )}
      />
    </View>
  );
}
