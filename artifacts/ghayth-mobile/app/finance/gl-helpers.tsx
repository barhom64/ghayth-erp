import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface GlHelperData { pendingCycleCount?: number; pendingFxRevaluation?: number; pendingLotWriteoff?: number; pendingPayrollLiability?: number; }

export default function GlHelpers() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<GlHelperData>('/api/finance/gl-helpers/cycle-count/pending');
  const d = (data && !Array.isArray(data)) ? data as GlHelperData : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مساعدات دفتر الأستاذ' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'جرد دورة معلق', value: d?.pendingCycleCount }, { label: 'إعادة تقييم FX معلقة', value: d?.pendingFxRevaluation }, { label: 'شطب دفعات معلق', value: d?.pendingLotWriteoff }, { label: 'التزام رواتب معلق', value: d?.pendingPayrollLiability }].map((row, i) => (
          <View key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{row.label}</Text>
            <Text style={{ color: row.value ? '#f59e0b' : '#22c55e', fontSize: 16, fontWeight: '700' }}>{row.value !== undefined ? String(row.value) : '—'}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
