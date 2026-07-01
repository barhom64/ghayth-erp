import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Violation { id?: number; vehicleName?: string; driverName?: string; date?: string; type?: string; fineAmount?: number; status?: string; }

export default function TrafficViolationDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<Violation>(`/api/fleet/violations/${id}`);
  const d = (data && !Array.isArray(data)) ? data as Violation : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  if (!d) return <GEmptyState icon="warning-outline" title="لا توجد بيانات" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تفاصيل المخالفة المرورية' }} />
      <View style={{ padding: 16, gap: 12 }}>
        {[
          { label: 'المركبة', value: d.vehicleName },
          { label: 'السائق', value: d.driverName },
          { label: 'التاريخ', value: d.date ? new Date(d.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined },
          { label: 'نوع المخالفة', value: d.type },
          { label: 'قيمة الغرامة', value: d.fineAmount != null ? `${d.fineAmount.toLocaleString('ar-SA')} ر.س` : undefined },
          { label: 'الحالة', value: d.status },
        ].map(r => r.value ? (
          <View key={r.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{r.label}</Text>
            <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{r.value}</Text>
          </View>
        ) : null)}
      </View>
    </ScrollView>
  );
}
