import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SubstitutionState {
  active?: boolean;
  entityType?: string;
  entityId?: number;
  substituteAccountId?: number;
  substituteAccountName?: string;
  reason?: string;
  [key: string]: unknown;
}

export default function SubsidiaryStateScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SubstitutionState[]>('/api/subsidiary-substitution/state');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل حالة الإحلال…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  if (!list.length) return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'حالة إحلال الحسابات' }} />
      <GEmptyState icon="checkmark-circle-outline" title="لا يوجد إحلال نشط" description="" />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'حالة إحلال الحسابات' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {list.map((item, i) => (
          <View key={i} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, marginBottom: 12, borderRightWidth: 3, borderRightColor: item.active ? '#F59E0B' : c.border }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>
              {item.entityType ?? '—'} #{item.entityId}
            </Text>
            {item.substituteAccountName ? (
              <Text style={{ fontSize: 12, color: c.brand, textAlign: 'right' }}>الحساب البديل: {item.substituteAccountName}</Text>
            ) : null}
            {item.reason ? <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right', marginTop: 4 }}>{item.reason}</Text> : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
