import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DisciplineMemo { id?: number; employeeName?: string; subject?: string; content?: string; issuedAt?: string; status?: string; }

export default function DisciplineMemoDetail() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DisciplineMemo>('/api/hr/discipline/memos/0');
  const d = (data && !Array.isArray(data)) ? data as DisciplineMemo : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تفاصيل المذكرة التأديبية' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'الموظف', value: d?.employeeName }, { label: 'الموضوع', value: d?.subject }, { label: 'تاريخ الإصدار', value: d?.issuedAt ? new Date(d.issuedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined }, { label: 'الحالة', value: d?.status }].map((row, i) => row.value ? (
          <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 13 }}>{row.value}</Text>
          </View>
        ) : null)}
        {d?.content && (
          <View style={{ marginTop: 16 }}>
            <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 8 }}>المحتوى:</Text>
            <Text style={{ color: c.text, fontSize: 14, lineHeight: 22 }}>{d.content}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
