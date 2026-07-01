import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TaxCode { id?: number; code?: string; name?: string; rate?: number; type?: string; }

export default function TaxCodeDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError } = useList<TaxCode>(`/api/finance/tax-codes/${id ?? ''}`);
  const item = (data && !Array.isArray(data)) ? data as TaxCode : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !item) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: item.name ?? 'تفاصيل رمز الضريبة' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'الرمز', value: item.code }, { label: 'الاسم', value: item.name }, { label: 'النسبة', value: item.rate != null ? `${item.rate}%` : '—' }, { label: 'النوع', value: item.type }].map(row => (
          <View key={row.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{row.value ?? '—'}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
