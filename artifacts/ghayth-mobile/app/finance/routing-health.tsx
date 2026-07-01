import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RoutingHealth { totalLines?: number; routedLines?: number; unroutedLines?: number; coverage?: number; issues?: string[]; }

export default function DimensionalRoutingHealth() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RoutingHealth>('/api/finance/dimensional-routing/health');
  const d = (data && !Array.isArray(data)) ? data as RoutingHealth : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const stat = (label: string, value?: number, suffix?: string) => (
    <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16, margin: 6, flex: 1, alignItems: 'center' }}>
      <Text style={{ color: c.brand, fontSize: 22, fontWeight: '700' }}>{value ?? '—'}{suffix ?? ''}</Text>
      <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>{label}</Text>
    </View>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 10, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'صحة توجيه الأبعاد' }} />
      <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap' }}>
        {stat('إجمالي السطور', d.totalLines)}
        {stat('سطور موجّهة', d.routedLines)}
        {stat('غير موجّهة', d.unroutedLines)}
        {stat('التغطية', d.coverage, '%')}
      </View>
      {Array.isArray(d.issues) && d.issues.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', marginBottom: 8 }}>المشاكل</Text>
          {d.issues.map((issue, i) => (
            <View key={i} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ color: '#ef4444', fontSize: 13 }}>{issue}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
