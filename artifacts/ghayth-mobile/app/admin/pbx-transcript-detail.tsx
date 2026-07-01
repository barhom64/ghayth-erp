import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PbxTranscript { id?: number; callId?: string; duration?: number; transcript?: string; participants?: string[]; recordedAt?: string; }

export default function PbxTranscriptDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<PbxTranscript>(`/api/admin/pbx-control/transcripts/${id ?? '0'}`);
  const d = (data && !Array.isArray(data)) ? data as PbxTranscript : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'نص المكالمة' }} />
      {!!d.callId && <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 8 }}>المكالمة: {d.callId}</Text>}
      {d.duration !== undefined && <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 8 }}>المدة: {d.duration} ث</Text>}
      {!!d.recordedAt && <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 12 }}>{new Date(d.recordedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
      {!!d.transcript && (
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.text, fontSize: 13, lineHeight: 22 }}>{d.transcript}</Text>
        </View>
      )}
    </ScrollView>
  );
}
