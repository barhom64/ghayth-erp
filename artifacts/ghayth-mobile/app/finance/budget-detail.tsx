import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Budget { id?: number; name?: string; year?: number; totalAmount?: number; usedAmount?: number; status?: string; }

export default function BudgetDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError } = useList<Budget>(`/api/finance/budget/${id ?? ''}`);
  const item = (data && !Array.isArray(data)) ? data as Budget : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل الميزانية…" />;
  if (isError || !item) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: item.name ?? 'تفاصيل الميزانية' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[
          { label: 'الاسم', value: item.name },
          { label: 'السنة', value: item.year?.toString() },
          { label: 'إجمالي الميزانية', value: item.totalAmount != null ? item.totalAmount.toLocaleString('ar-SA') + ' ر.س' : '—' },
          { label: 'المستخدم', value: item.usedAmount != null ? item.usedAmount.toLocaleString('ar-SA') + ' ر.س' : '—' },
          { label: 'المتبقي', value: item.totalAmount != null && item.usedAmount != null ? (item.totalAmount - item.usedAmount).toLocaleString('ar-SA') + ' ر.س' : '—' },
          { label: 'الحالة', value: item.status },
        ].map(row => (
          <View key={row.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{row.value ?? '—'}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
