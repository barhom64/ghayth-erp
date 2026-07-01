import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ObsOverview { [key: string]: unknown; }

export default function ObservabilityOverviewScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ObsOverview>('/api/admin/observability/overview');
  const overview = (data && !Array.isArray(data)) ? data as ObsOverview : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نظرة عامة — المراقبة' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {overview ? Object.entries(overview).map(([k, v]) => (
          <View key={k} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{k}</Text>
            <Text style={{ color: c.text, fontSize: 14, marginTop: 4 }}>{String(v ?? '')}</Text>
          </View>
        )) : <GEmptyState icon="eye-outline" title="لا توجد بيانات" description="" />}
      </ScrollView>
    </View>
  );
}
