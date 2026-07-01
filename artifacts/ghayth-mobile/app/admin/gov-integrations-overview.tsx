import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface GovOverview { totalLinks?: number; activeLinks?: number; pendingRenewals?: number; }

export default function GovIntegrationsOverview() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<GovOverview>('/api/gov-integrations');
  const d = (data && !Array.isArray(data)) ? data as GovOverview : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التكاملات الحكومية' }} />
      <View style={{ padding: 16, gap: 12 }}>
        {[
          { label: 'إجمالي الروابط', value: String(d?.totalLinks ?? '—') },
          { label: 'الروابط النشطة', value: String(d?.activeLinks ?? '—') },
          { label: 'التجديدات المعلّقة', value: String(d?.pendingRenewals ?? '—') },
        ].map(r => (
          <View key={r.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{r.label}</Text>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '600', marginTop: 4 }}>{r.value}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
