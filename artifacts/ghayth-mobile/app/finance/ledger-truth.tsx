import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LedgerTruth { dimensionedPercent?: number; orphanCount?: number; status?: string; }

export default function LedgerTruthScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<LedgerTruth>('/api/finance/reports/ledger-truth');
  const info = (data && !Array.isArray(data)) ? data as LedgerTruth : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  if (!info) return <GEmptyState icon="shield-checkmark-outline" title="لا توجد بيانات" description="" />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة الصدق المحاسبي' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>نسبة السطور المبعّدة</Text>
          <Text style={{ color: c.brand, fontSize: 28, fontWeight: 'bold' }}>
            {info.dimensionedPercent != null ? `${info.dimensionedPercent.toFixed(1)}%` : '-'}
          </Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>القيود اليتيمة</Text>
          <Text style={{ color: (info.orphanCount ?? 0) > 0 ? '#e53e3e' : '#38a169', fontSize: 24, fontWeight: 'bold' }}>
            {info.orphanCount ?? 0}
          </Text>
        </View>
        {info.status ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16 }}>
            <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>الحالة</Text>
            <Text style={{ color: c.text, fontSize: 14 }}>{info.status}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
