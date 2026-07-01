import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AccountingMapping { operationType?: string; debitAccount?: string; creditAccount?: string; [key: string]: unknown; }

export default function AccountingMappingDetail() {
  const c = useColors();
  const { operationType } = useLocalSearchParams<{ operationType: string }>();
  const { data, isLoading, isError } = useList<AccountingMapping>(`/api/accounting-mappings/${operationType ?? ''}`);
  const item = (data && !Array.isArray(data)) ? data as AccountingMapping : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل التعيين المحاسبي…" />;
  if (isError || !item) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: item.operationType ?? 'تفاصيل التعيين المحاسبي' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {Object.entries(item).map(([k, v]) => (
          <View key={k} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{k}</Text>
            <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{String(v ?? '—')}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
