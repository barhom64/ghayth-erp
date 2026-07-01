import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Workflow { id?: number; name?: string; status?: string; definitionId?: number; createdAt?: string; completedAt?: string; currentStep?: string; }

export default function WorkflowDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<Workflow>(`/api/workflows/${id ?? '0'}`);
  const d = (data && !Array.isArray(data)) ? data as Workflow : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const row = (label: string, value?: string | number) => value !== undefined ? (
    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 13 }}>{String(value)}</Text>
    </View>
  ) : null;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: d.name ?? 'تفاصيل سير العمل' }} />
      {row('الاسم', d.name)}
      {row('الحالة', d.status)}
      {row('الخطوة الحالية', d.currentStep)}
      {!!d.createdAt && row('تاريخ الإنشاء', new Date(d.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }))}
      {!!d.completedAt && row('تاريخ الإكمال', new Date(d.completedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }))}
    </ScrollView>
  );
}
