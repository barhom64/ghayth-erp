import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RfmData { recency?: number; frequency?: number; monetary?: number; segment?: string; }

export default function ClientRfm() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RfmData>('/api/intelligence/clients/0/rfm');
  const d = (data && !Array.isArray(data)) ? data as RfmData : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تحليل RFM للعميل' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'الحداثة (أيام)', value: d?.recency }, { label: 'التكرار', value: d?.frequency }, { label: 'القيمة المالية', value: d?.monetary }, { label: 'الشريحة', value: d?.segment }].map((row, i) => (
          <View key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8 }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '700', marginTop: 4 }}>{row.value !== undefined ? String(row.value) : '—'}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
