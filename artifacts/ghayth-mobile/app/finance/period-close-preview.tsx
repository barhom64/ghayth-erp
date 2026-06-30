import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ClosePreview { canClose?: boolean; blockers?: string[]; warnings?: string[]; }

export default function PeriodClosePreview() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ClosePreview>('/api/finance/fiscal-periods-v2/0/close-preview');
  const d = (data && !Array.isArray(data)) ? data as ClosePreview : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'معاينة إقفال الفترة' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ backgroundColor: d?.canClose ? '#dcfce7' : '#fee2e2', borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <Text style={{ color: d?.canClose ? '#166534' : '#991b1b', fontSize: 16, fontWeight: '700', textAlign: 'center' }}>
            {d?.canClose ? 'يمكن الإقفال' : 'لا يمكن الإقفال'}
          </Text>
        </View>
        {(d?.blockers ?? []).length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: '#991b1b', fontSize: 14, fontWeight: '600', marginBottom: 8 }}>حواجز:</Text>
            {(d?.blockers ?? []).map((b, i) => (
              <Text key={i} style={{ color: c.text, fontSize: 13, marginBottom: 4 }}>• {b}</Text>
            ))}
          </View>
        )}
        {(d?.warnings ?? []).length > 0 && (
          <View>
            <Text style={{ color: '#92400e', fontSize: 14, fontWeight: '600', marginBottom: 8 }}>تحذيرات:</Text>
            {(d?.warnings ?? []).map((w, i) => (
              <Text key={i} style={{ color: c.text, fontSize: 13, marginBottom: 4 }}>• {w}</Text>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
