import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AiInsight {
  id?: number | string;
  title?: string;
  summary?: string;
  domain?: string;
  severity?: string;
  recommendation?: string;
  createdAt?: string;
}

const severityColor = (s?: string) => {
  if (s === 'high' || s === 'critical') return '#EF4444';
  if (s === 'medium') return '#F59E0B';
  return '#22C55E';
};

export default function AiInsightsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AiInsight[]>('/api/bi/ai-insights');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الرؤى الذكية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الرؤى الذكية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bulb-outline" title="لا توجد رؤى" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, borderRightWidth: 4, borderRightColor: severityColor(item.severity) }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.title ?? '—'}</Text>
              {item.domain ? <Text style={{ fontSize: 11, color: c.brand }}>{item.domain}</Text> : null}
            </View>
            {item.summary ? <Text style={{ fontSize: 12, color: c.textMuted, marginBottom: 4 }}>{item.summary}</Text> : null}
            {item.recommendation ? (
              <Text style={{ fontSize: 12, color: '#22C55E' }}>التوصية: {item.recommendation}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
