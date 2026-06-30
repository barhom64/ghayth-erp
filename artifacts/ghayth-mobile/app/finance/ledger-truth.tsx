import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LedgerTruth {
  dimensionalPct?: number;
  orphanCount?: number;
  orphansBySource?: { sourceType?: string; count?: number }[];
  periodBalance?: number;
  canClose?: boolean;
}

export default function LedgerTruthScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<LedgerTruth>('/api/reports/ledger-truth');

  if (isLoading) return <GLoadingState text="جارٍ تحميل صدق الدفتر…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const d = (Array.isArray(data) ? data[0] : data) as LedgerTruth | undefined;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'صدق الدفتر' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16 }}>
          <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>نسبة الأبعاد</Text>
          <Text style={{ fontSize: 32, fontWeight: '700', color: (d?.dimensionalPct ?? 0) >= 95 ? '#22C55E' : '#EF4444', textAlign: 'right' }}>{d?.dimensionalPct != null ? `${d.dimensionalPct.toFixed(1)}%` : '—'}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 13, color: c.text }}>القيود اليتيمة</Text>
          <Text style={{ fontSize: 15, fontWeight: '700', color: (d?.orphanCount ?? 0) > 0 ? '#EF4444' : '#22C55E' }}>{d?.orphanCount ?? 0}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 13, color: c.text }}>يمكن الإقفال</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: d?.canClose ? '#22C55E' : '#EF4444' }}>{d?.canClose ? 'نعم' : 'لا'}</Text>
        </View>
        {(d?.orphansBySource ?? []).map((row, i) => (
          <View key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, color: c.textMuted }}>{row.sourceType ?? '—'}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>{row.count ?? 0}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
