import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EntityPnl { revenue?: number; expenses?: number; netIncome?: number; period?: string; }

export default function EntityPnl() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<EntityPnl>('/api/finance/entity-pnl/vehicle/0');
  const d = (data && !Array.isArray(data)) ? data as EntityPnl : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ربح وخسارة الكيان' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'الإيراد', value: d?.revenue?.toLocaleString('ar-SA') }, { label: 'المصاريف', value: d?.expenses?.toLocaleString('ar-SA') }, { label: 'صافي الدخل', value: d?.netIncome?.toLocaleString('ar-SA') }].map((row, i) => (
          <View key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8 }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '700', marginTop: 4 }}>{row.value !== undefined ? `${row.value} ر.س` : '—'}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
