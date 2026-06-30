import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Regulation { id?: number; title?: string; content?: string; category?: string; effectiveDate?: string; }

export default function DisciplineRegulationDetail() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Regulation>('/api/hr/discipline/regulation/0');
  const d = (data && !Array.isArray(data)) ? data as Regulation : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تفاصيل اللائحة التأديبية' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: c.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>{d?.title ?? '—'}</Text>
        {d?.category && <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 4 }}>الفئة: {d.category}</Text>}
        {d?.effectiveDate && <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 16 }}>تاريخ السريان: {new Date(d.effectiveDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
        <Text style={{ color: c.text, fontSize: 14, lineHeight: 22 }}>{d?.content ?? ''}</Text>
      </ScrollView>
    </View>
  );
}
