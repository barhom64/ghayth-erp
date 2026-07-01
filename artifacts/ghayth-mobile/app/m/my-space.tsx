import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface MySpace { name?: string; position?: string; department?: string; pendingLeaves?: number; pendingTasks?: number; upcomingEvents?: number; }

export default function MySpace() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<MySpace>('/api/my-space/');
  const d = (data && !Array.isArray(data)) ? data as MySpace : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const stat = (label: string, value?: number | string) => (
    <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16, margin: 6, flex: 1, alignItems: 'center' }}>
      <Text style={{ color: c.brand, fontSize: 24, fontWeight: '700' }}>{value ?? '—'}</Text>
      <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>{label}</Text>
    </View>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'مساحتي' }} />
      <Text style={{ color: c.text, fontSize: 20, fontWeight: '700', textAlign: 'right', marginBottom: 4 }}>{d.name ?? ''}</Text>
      <Text style={{ color: c.textMuted, fontSize: 14, textAlign: 'right', marginBottom: 16 }}>{d.position ?? ''} • {d.department ?? ''}</Text>
      <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap' }}>
        {stat('إجازات معلّقة', d.pendingLeaves)}
        {stat('مهام قيد التنفيذ', d.pendingTasks)}
        {stat('أحداث قادمة', d.upcomingEvents)}
      </View>
    </ScrollView>
  );
}
