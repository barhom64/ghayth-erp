import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UnitImpact { unitId?: number; affectedContracts?: number; affectedTenants?: number; estimatedRevenueLoss?: number; warnings?: string[]; }

export default function UnitImpactPreview() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<UnitImpact>('/api/properties/units/0/impact-preview');
  const d = (data && !Array.isArray(data)) ? data as UnitImpact : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'معاينة تأثير تعديل الوحدة' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'العقود المتأثرة', value: d?.affectedContracts }, { label: 'المستأجرون المتأثرون', value: d?.affectedTenants }, { label: 'خسارة إيراد متوقعة', value: d?.estimatedRevenueLoss?.toLocaleString('ar-SA') ? `${d.estimatedRevenueLoss.toLocaleString('ar-SA')} ر.س` : undefined }].map((row, i) => (
          <View key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8 }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '700', marginTop: 4 }}>{row.value !== undefined ? String(row.value) : '—'}</Text>
          </View>
        ))}
        {(d?.warnings ?? []).length > 0 && (
          <View style={{ backgroundColor: '#fef3c7', borderRadius: 8, padding: 14, marginTop: 8 }}>
            <Text style={{ color: '#92400e', fontSize: 13, fontWeight: '600', marginBottom: 6 }}>تحذيرات:</Text>
            {(d?.warnings ?? []).map((w, i) => <Text key={i} style={{ color: '#92400e', fontSize: 13, marginBottom: 4 }}>• {w}</Text>)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
