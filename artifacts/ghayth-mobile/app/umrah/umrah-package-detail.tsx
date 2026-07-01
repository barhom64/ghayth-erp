import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Package { id?: number; name?: string; price?: number; duration?: number; includes?: string; status?: string; }

export default function UmrahPackageDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<Package>(`/api/umrah/packages/${id}`);
  const d = (data && !Array.isArray(data)) ? data as Package : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  if (!d) return <GEmptyState icon="gift-outline" title="لا توجد بيانات" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: d.name ?? 'تفاصيل الباقة' }} />
      <View style={{ padding: 16, gap: 12 }}>
        {[
          { label: 'اسم الباقة', value: d.name },
          { label: 'السعر', value: d.price != null ? `${d.price.toLocaleString('ar-SA')} ر.س` : undefined },
          { label: 'المدة (أيام)', value: d.duration != null ? String(d.duration) : undefined },
          { label: 'يشمل', value: d.includes },
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
