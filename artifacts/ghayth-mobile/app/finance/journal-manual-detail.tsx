import React from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ManualJournal { id?: number; referenceNo?: string; status?: string; description?: string; totalDebit?: number; lines?: { accountCode?: string; debit?: number; credit?: number; description?: string; }[]; }

export default function JournalManualDetail() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ManualJournal>('/api/finance/journal-manual/0');
  const d = (data && !Array.isArray(data)) ? data as ManualJournal : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const lines = d?.lines ?? [];
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: `قيد ${d?.referenceNo ?? ''}` }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'المرجع', value: d?.referenceNo }, { label: 'الحالة', value: d?.status }, { label: 'إجمالي المدين', value: d?.totalDebit?.toLocaleString('ar-SA') }, { label: 'الوصف', value: d?.description }].map((row, i) => row.value ? (
          <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 13 }}>{row.value}</Text>
          </View>
        ) : null)}
        <Text style={{ color: c.text, fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 }}>سطور القيد</Text>
        {lines.map((line, i) => (
          <View key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 12, marginBottom: 6, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 13 }}>{line.accountCode ?? '—'}</Text>
            <Text style={{ color: c.brand, fontSize: 13 }}>{line.debit ? `مدين: ${line.debit.toLocaleString('ar-SA')}` : `دائن: ${(line.credit ?? 0).toLocaleString('ar-SA')}`}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
