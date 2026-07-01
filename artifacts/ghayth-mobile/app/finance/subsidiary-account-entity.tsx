import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SubsidiaryAccount { entityType?: string; entityId?: number; accountCode?: string; balance?: number; }

export default function SubsidiaryAccountEntity() {
  const c = useColors();
  const { entityType, entityId } = useLocalSearchParams<{ entityType: string; entityId: string }>();
  const { data, isLoading, isError } = useList<SubsidiaryAccount>(`/api/subsidiary-accounts/entity/${entityType ?? ''}/${entityId ?? ''}`);
  const item = (data && !Array.isArray(data)) ? data as SubsidiaryAccount : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل الحساب الفرعي…" />;
  if (isError || !item) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الحساب الفرعي للكيان' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'نوع الكيان', value: item.entityType }, { label: 'رمز الحساب', value: item.accountCode }, { label: 'الرصيد', value: item.balance != null ? item.balance.toLocaleString('ar-SA') + ' ر.س' : '—' }].map(row => (
          <View key={row.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{row.value ?? '—'}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
