import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CostCenter { id?: number; code?: string; name?: string; type?: string; parentId?: number; balance?: number; isActive?: boolean; }

export default function CostCenterDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<CostCenter>(`/api/finance/cost-centers/${id ?? '0'}`);
  const d = (data && !Array.isArray(data)) ? data as CostCenter : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const row = (label: string, value?: string | number | boolean) => value !== undefined ? (
    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 13 }}>{value === true ? 'نشط' : value === false ? 'غير نشط' : String(value)}</Text>
    </View>
  ) : null;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: d.name ?? 'مركز التكلفة' }} />
      {row('الكود', d.code)}
      {row('الاسم', d.name)}
      {row('النوع', d.type)}
      {row('الرصيد', d.balance !== undefined ? `${d.balance.toLocaleString('ar-SA')} ر.س` : undefined)}
      {row('الحالة', d.isActive)}
    </ScrollView>
  );
}
