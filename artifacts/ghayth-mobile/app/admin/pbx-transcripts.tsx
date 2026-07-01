import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PbxTranscript {
  id?: number;
  callerNumber?: string;
  duration?: number;
  transcribedAt?: string;
  summary?: string;
  sentiment?: string;
}

export default function PbxTranscriptsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PbxTranscript[]>('/api/admin/pbx-control/transcripts');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل نصوص المكالمات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const sentimentColor = (s?: string) => s === 'positive' ? '#22C55E' : s === 'negative' ? '#EF4444' : '#F59E0B';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نصوص المكالمات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد نصوص" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.callerNumber ?? '—'}</Text>
              {item.sentiment ? <Text style={{ fontSize: 12, color: sentimentColor(item.sentiment) }}>●</Text> : null}
            </View>
            {item.summary ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.summary}</Text> : null}
            {item.duration != null ? <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>{item.duration} ث</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
