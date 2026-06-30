import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OptimizerRun { id?: number; status?: string; vehiclesOptimized?: number; savings?: number; completedAt?: string; }

export default function OptimizerRunDetail() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<OptimizerRun>('/api/fleet/optimizer/runs/0');
  const d = (data && !Array.isArray(data)) ? data as OptimizerRun : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: `تشغيل المحسّن ${d?.id ?? ''}` }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'الحالة', value: d?.status }, { label: 'المركبات المُحسَّنة', value: d?.vehiclesOptimized !== undefined ? String(d.vehiclesOptimized) : undefined }, { label: 'الوفورات', value: d?.savings?.toLocaleString('ar-SA') ? `${d.savings.toLocaleString('ar-SA')} ر.س` : undefined }, { label: 'وقت الإكمال', value: d?.completedAt ? new Date(d.completedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined }].map((row, i) => row.value ? (
          <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 13 }}>{row.value}</Text>
          </View>
        ) : null)}
      </ScrollView>
    </View>
  );
}
