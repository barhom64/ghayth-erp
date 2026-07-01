import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Season { id?: number; name?: string; year?: number; startDate?: string; endDate?: string; status?: string; pilgrims?: number; }

export default function UmrahSeasonDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<Season>(`/api/umrah/seasons/${id}`);
  const d = (data && !Array.isArray(data)) ? data as Season : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  if (!d) return <GEmptyState icon="partly-sunny-outline" title="لا توجد بيانات" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: d.name ?? 'تفاصيل الموسم' }} />
      <View style={{ padding: 16, gap: 12 }}>
        {[
          { label: 'اسم الموسم', value: d.name },
          { label: 'السنة', value: d.year != null ? String(d.year) : undefined },
          { label: 'من', value: d.startDate ? new Date(d.startDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined },
          { label: 'إلى', value: d.endDate ? new Date(d.endDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined },
          { label: 'عدد الحجاج', value: d.pilgrims != null ? String(d.pilgrims) : undefined },
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
