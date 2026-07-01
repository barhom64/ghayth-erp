import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Correspondence { id?: number; subject?: string; body?: string; fromEmail?: string; toEmail?: string; createdAt?: string; }

export default function CorrespondenceDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<Correspondence>(`/api/correspondence/${id}`);
  const item = (data && !Array.isArray(data)) ? data as Correspondence : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !item) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تفاصيل المراسلة' }} />
      <View style={{ backgroundColor: c.surface, margin: 12, borderRadius: 8, padding: 16 }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>{item.subject ?? '—'}</Text>
        <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>من: {item.fromEmail ?? '—'}</Text>
        <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 12 }}>إلى: {item.toEmail ?? '—'}</Text>
        {item.createdAt && <Text style={{ color: c.textFaint, fontSize: 11, marginBottom: 12 }}>{new Date(item.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
        <Text style={{ color: c.text, fontSize: 14, lineHeight: 22 }}>{item.body ?? ''}</Text>
      </View>
    </ScrollView>
  );
}
