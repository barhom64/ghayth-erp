import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Transfer { id?: number; employeeName?: string; fromBranch?: string; toBranch?: string; effectiveDate?: string; status?: string; reason?: string; }

export default function TransferDetail() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Transfer>('/api/hr/transfers/0');
  const d = (data && !Array.isArray(data)) ? data as Transfer : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تفاصيل طلب النقل' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'الموظف', value: d?.employeeName }, { label: 'من فرع', value: d?.fromBranch }, { label: 'إلى فرع', value: d?.toBranch }, { label: 'تاريخ التفعيل', value: d?.effectiveDate ? new Date(d.effectiveDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined }, { label: 'الحالة', value: d?.status }, { label: 'السبب', value: d?.reason }].map((row, i) => row.value ? (
          <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 13 }}>{row.value}</Text>
          </View>
        ) : null)}
      </ScrollView>
    </View>
  );
}
