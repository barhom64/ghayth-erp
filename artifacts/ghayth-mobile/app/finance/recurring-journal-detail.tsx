import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RecurringJournal { id?: number; name?: string; frequency?: string; nextRun?: string; status?: string; amount?: number; }

export default function RecurringJournalDetail() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RecurringJournal>('/api/finance/recurring-journals/0');
  const d = (data && !Array.isArray(data)) ? data as RecurringJournal : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: `قيد دوري ${d?.name ?? ''}` }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'الاسم', value: d?.name }, { label: 'التكرار', value: d?.frequency }, { label: 'التشغيل التالي', value: d?.nextRun ? new Date(d.nextRun).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined }, { label: 'الحالة', value: d?.status }, { label: 'المبلغ', value: d?.amount?.toLocaleString('ar-SA') ? `${d.amount.toLocaleString('ar-SA')} ر.س` : undefined }].map((row, i) => row.value ? (
          <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 13 }}>{row.value}</Text>
          </View>
        ) : null)}
      </ScrollView>
    </View>
  );
}
