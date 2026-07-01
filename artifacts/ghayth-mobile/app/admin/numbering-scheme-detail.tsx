import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Scheme { id?: number; entity?: string; prefix?: string; nextSeq?: number; pattern?: string; }

export default function NumberingSchemeDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<Scheme>(`/api/numbering/schemes/${id}`);
  const s = (data && !Array.isArray(data)) ? data as Scheme : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !s) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const rows = [
    { label: 'الكيان', value: s.entity ?? '—' },
    { label: 'البادئة', value: s.prefix ?? '—' },
    { label: 'التسلسل التالي', value: String(s.nextSeq ?? 1) },
    { label: 'النمط', value: s.pattern ?? '—' },
  ];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نظام الترقيم' }} />
      {rows.map(r => (
        <View key={r.label} style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{r.label}</Text>
          <Text style={{ color: c.text, fontSize: 14 }}>{r.value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
