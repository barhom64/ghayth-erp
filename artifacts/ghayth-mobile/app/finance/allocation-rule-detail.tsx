import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AllocationRule { id?: number; name?: string; sourceAccount?: string; method?: string; active?: boolean; }

export default function AllocationRuleDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError } = useList<AllocationRule>(`/api/finance/allocation-rules/${id ?? ''}`);
  const item = (data && !Array.isArray(data)) ? data as AllocationRule : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !item) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: item.name ?? 'تفاصيل قاعدة التوزيع' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'الاسم', value: item.name }, { label: 'الحساب المصدر', value: item.sourceAccount }, { label: 'طريقة التوزيع', value: item.method }, { label: 'الحالة', value: item.active ? 'نشط' : 'غير نشط' }].map(row => (
          <View key={row.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{row.value ?? '—'}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
