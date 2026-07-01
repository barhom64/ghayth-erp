import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Account { id?: number; code?: string; name?: string; type?: string; balance?: number; currency?: string; }

export default function AccountDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<Account>(`/api/finance/accounts/${id}`);
  const d = (data && !Array.isArray(data)) ? data as Account : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  if (!d) return <GEmptyState icon="wallet-outline" title="لا توجد بيانات" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: d.name ?? 'الحساب' }} />
      <View style={{ padding: 16, gap: 12 }}>
        {[
          { label: 'الكود', value: d.code },
          { label: 'الاسم', value: d.name },
          { label: 'النوع', value: d.type },
          { label: 'الرصيد', value: d.balance != null ? `${d.balance.toLocaleString('ar-SA')} ${d.currency ?? 'ر.س'}` : undefined },
        ].map(r => r.value ? (
          <View key={r.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{r.label}</Text>
            <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{r.value}</Text>
          </View>
        ) : null)}
      </View>
    </ScrollView>
  );
}
