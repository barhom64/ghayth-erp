import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface JournalTemplate { id?: number; name?: string; description?: string; operationType?: string; lines?: { accountCode?: string; direction?: string; ratio?: number }[]; }

export default function JournalTemplateDetailScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<JournalTemplate>('/api/finance/accounting-engine/journal-templates/0');
  const d = (data && !Array.isArray(data)) ? data as JournalTemplate : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قالب القيد' }} />
      <View style={{ backgroundColor: c.surface, padding: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{d.name ?? '-'}</Text>
        <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 4 }}>{d.description ?? ''}</Text>
        <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>النوع: {d.operationType ?? '-'}</Text>
      </View>
      {(d.lines ?? []).map((line, i) => (
        <View key={i} style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
          <Text style={{ color: c.text, fontSize: 13 }}>{line.accountCode} — {line.direction} — {line.ratio}%</Text>
        </View>
      ))}
    </ScrollView>
  );
}
