import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UmrahPolicies {
  cancellationPolicy?: string;
  refundPolicy?: string;
  depositPercentage?: number;
  maxGroupSize?: number;
  minDaysBeforeTravel?: number;
  autoAssignDriver?: boolean;
}

export default function UmrahPoliciesScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<UmrahPolicies>('/api/umrah/settings/policies');
  const d = (data && !Array.isArray(data)) ? data as UmrahPolicies : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل سياسات العمرة…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const rows = [
    { label: 'سياسة الإلغاء', value: d?.cancellationPolicy ?? '—' },
    { label: 'سياسة الاسترداد', value: d?.refundPolicy ?? '—' },
    { label: 'نسبة العربون', value: d?.depositPercentage != null ? `${d.depositPercentage}%` : '—' },
    { label: 'أقصى حجم مجموعة', value: d?.maxGroupSize != null ? String(d.maxGroupSize) : '—' },
    { label: 'أدنى أيام قبل السفر', value: d?.minDaysBeforeTravel != null ? `${d.minDaysBeforeTravel} يوم` : '—' },
    { label: 'تعيين سائق تلقائي', value: d?.autoAssignDriver ? 'نعم' : 'لا' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سياسات العمرة' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        {rows.map(r => (
          <View key={r.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: c.text }}>{r.label}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.brand }}>{r.value}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
