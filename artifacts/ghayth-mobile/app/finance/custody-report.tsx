import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CustodyReport { totalCustodies?: number; totalAmount?: number; activeCount?: number; closedCount?: number; }

export default function CustodyReport() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CustodyReport>('/api/finance/custodies/report');
  const d = (data && !Array.isArray(data)) ? data as CustodyReport : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقرير العهد' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'إجمالي العهد', value: d?.totalCustodies }, { label: 'إجمالي المبلغ', value: d?.totalAmount?.toLocaleString('ar-SA') ? `${d.totalAmount.toLocaleString('ar-SA')} ر.س` : undefined }, { label: 'عهد نشطة', value: d?.activeCount }, { label: 'عهد مغلقة', value: d?.closedCount }].map((row, i) => (
          <View key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8 }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '700', marginTop: 4 }}>{row.value !== undefined ? String(row.value) : '—'}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
