import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PbxSetup { host?: string; port?: number; protocol?: string; status?: string; extensions?: number; trunkLines?: number; }

export default function PbxSetup() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PbxSetup>('/api/admin/pbx-control/setup');
  const d = (data && !Array.isArray(data)) ? data as PbxSetup : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const row = (label: string, value?: string | number) => (
    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 13 }}>{value ?? '—'}</Text>
    </View>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'إعداد PBX' }} />
      {row('المضيف', d.host)}
      {row('المنفذ', d.port)}
      {row('البروتوكول', d.protocol)}
      {row('الحالة', d.status)}
      {row('التحويلات', d.extensions)}
      {row('خطوط التوصيل', d.trunkLines)}
    </ScrollView>
  );
}
