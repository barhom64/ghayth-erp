import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PortalProject { id?: number; name?: string; status?: string; progress?: number; }

export default function PortalProjectDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<PortalProject>(`/api/portal/projects/${id}`);
  const p = (data && !Array.isArray(data)) ? data as PortalProject : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !p) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: p.name ?? 'تفاصيل المشروع' }} />
      {[{ label: 'الاسم', value: p.name }, { label: 'الحالة', value: p.status }, { label: 'نسبة الإنجاز', value: `${p.progress ?? 0}%` }].map(r => (
        <View key={r.label} style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{r.label}</Text>
          <Text style={{ color: c.text, fontSize: 14 }}>{r.value ?? '—'}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
