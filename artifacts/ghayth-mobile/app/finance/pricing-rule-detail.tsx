import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PricingRule { id?: number; name?: string; type?: string; value?: number; appliesTo?: string; isActive?: boolean; }

export default function PricingRuleDetail() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PricingRule>('/api/finance/pricing/rules/0');
  const d = (data && !Array.isArray(data)) ? data as PricingRule : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تفاصيل قاعدة التسعير' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'الاسم', value: d?.name }, { label: 'النوع', value: d?.type }, { label: 'القيمة', value: d?.value !== undefined ? String(d.value) : undefined }, { label: 'ينطبق على', value: d?.appliesTo }, { label: 'الحالة', value: d?.isActive !== undefined ? (d.isActive ? 'نشط' : 'غير نشط') : undefined }].map((row, i) => row.value ? (
          <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 13 }}>{row.value}</Text>
          </View>
        ) : null)}
      </ScrollView>
    </View>
  );
}
