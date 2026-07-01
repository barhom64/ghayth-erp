import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ImportBatch { id?: number; entity?: string; status?: string; totalRows?: number; successRows?: number; failedRows?: number; createdAt?: string; }

export default function ImportBatchDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError } = useList<ImportBatch>(`/api/import/batches/${id ?? ''}`);
  const item = (data && !Array.isArray(data)) ? data as ImportBatch : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل دفعة الاستيراد…" />;
  if (isError || !item) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: `دفعة استيراد #${item.id ?? ''}` }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[
          { label: 'الكيان', value: item.entity },
          { label: 'الحالة', value: item.status },
          { label: 'إجمالي الصفوف', value: item.totalRows?.toString() },
          { label: 'ناجح', value: item.successRows?.toString() },
          { label: 'فاشل', value: item.failedRows?.toString() },
          { label: 'تاريخ الإنشاء', value: item.createdAt ? new Date(item.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
        ].map(row => (
          <View key={row.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{row.value ?? '—'}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
