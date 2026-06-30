import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CommOverview {
  totalSent?: number;
  totalDelivered?: number;
  totalFailed?: number;
  totalPending?: number;
  deliveryRate?: number;
  activeProviders?: number;
}

export default function AdminCommOverviewScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<CommOverview>('/api/admin/communication-control/overview');
  const d = (data && !Array.isArray(data)) ? data as CommOverview : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل نظرة الاتصالات…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const rows = [
    { label: 'إجمالي المُرسَل', value: d?.totalSent != null ? d.totalSent.toLocaleString('ar-SA') : '—' },
    { label: 'مُوصَّل', value: d?.totalDelivered != null ? d.totalDelivered.toLocaleString('ar-SA') : '—' },
    { label: 'فاشل', value: d?.totalFailed != null ? d.totalFailed.toLocaleString('ar-SA') : '—' },
    { label: 'معلّق', value: d?.totalPending != null ? d.totalPending.toLocaleString('ar-SA') : '—' },
    { label: 'نسبة التوصيل', value: d?.deliveryRate != null ? `${(d.deliveryRate * 100).toFixed(1)}%` : '—' },
    { label: 'مزودون نشطون', value: d?.activeProviders != null ? String(d.activeProviders) : '—' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نظرة عامة على الاتصالات' }} />
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
