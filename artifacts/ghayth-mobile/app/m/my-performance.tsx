import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Performance { overallScore?: number; period?: string; kpis?: Array<{ name?: string; score?: number; target?: number }>; feedback?: string; }

export default function MyPerformance() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Performance>('/api/my-space/performance');
  const d = (data && !Array.isArray(data)) ? data as Performance : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'أدائي' }} />
      {d.overallScore !== undefined && (
        <View style={{ alignItems: 'center', paddingVertical: 24, marginBottom: 16, backgroundColor: c.surface, borderRadius: 12 }}>
          <Text style={{ color: c.brand, fontSize: 48, fontWeight: '700' }}>{d.overallScore}</Text>
          <Text style={{ color: c.textMuted, fontSize: 14, marginTop: 4 }}>التقييم الكلي • {d.period ?? ''}</Text>
        </View>
      )}
      {Array.isArray(d.kpis) && d.kpis.length > 0 && (
        <View>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', marginBottom: 8 }}>المؤشرات</Text>
          {d.kpis.map((k, i) => (
            <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ color: c.text, fontSize: 13 }}>{k.name ?? ''}</Text>
              <Text style={{ color: c.brand, fontSize: 13 }}>{k.score ?? '—'} / {k.target ?? '—'}</Text>
            </View>
          ))}
        </View>
      )}
      {!!d.feedback && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>تغذية راجعة</Text>
          <Text style={{ color: c.text, fontSize: 14, lineHeight: 22 }}>{d.feedback}</Text>
        </View>
      )}
    </ScrollView>
  );
}
