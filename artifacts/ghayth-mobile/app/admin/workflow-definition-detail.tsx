import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface WorkflowDefinition { id?: number; name?: string; triggerEvent?: string; steps?: Array<{ order?: number; name?: string; approverRole?: string }>; isActive?: boolean; }

export default function WorkflowDefinitionDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<WorkflowDefinition>(`/api/workflows/definitions/${id ?? '0'}`);
  const d = (data && !Array.isArray(data)) ? data as WorkflowDefinition : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: d.name ?? 'تعريف سير العمل' }} />
      <Text style={{ color: c.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>{d.name ?? ''}</Text>
      {!!d.triggerEvent && <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 4 }}>الحدث: {d.triggerEvent}</Text>}
      <Text style={{ color: d.isActive ? '#22c55e' : c.textMuted, fontSize: 13, marginBottom: 16 }}>{d.isActive ? 'نشط' : 'غير نشط'}</Text>
      {Array.isArray(d.steps) && d.steps.length > 0 && (
        <View>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', marginBottom: 8 }}>الخطوات</Text>
          {d.steps.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ color: c.text, fontSize: 13 }}>{s.order}. {s.name}</Text>
              {!!s.approverRole && <Text style={{ color: c.textMuted, fontSize: 12 }}>{s.approverRole}</Text>}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
