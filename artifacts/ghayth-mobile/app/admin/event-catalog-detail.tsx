import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EventDef { name?: string; description?: string; schema?: string; emitters?: string[]; }

export default function EventCatalogDetail() {
  const c = useColors();
  const { name } = useLocalSearchParams<{ name: string }>();
  const { data, isLoading, isError, refetch } = useList<EventDef>(`/api/events/catalog/${name}`);
  const e = (data && !Array.isArray(data)) ? data as EventDef : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !e) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: e.name ?? 'تفاصيل الحدث' }} />
      <View style={{ backgroundColor: c.surface, margin: 12, borderRadius: 8, padding: 16 }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>{e.name ?? ''}</Text>
        {e.description && <Text style={{ color: c.textMuted, fontSize: 14, marginBottom: 12 }}>{e.description}</Text>}
        {(e.emitters ?? []).length > 0 && (
          <>
            <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 6 }}>المصادر:</Text>
            {e.emitters!.map((em, i) => <Text key={i} style={{ color: c.text, fontSize: 13 }}>• {em}</Text>)}
          </>
        )}
      </View>
    </ScrollView>
  );
}
