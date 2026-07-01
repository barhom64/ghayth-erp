import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Branch { id?: number; name?: string; code?: string; city?: string; active?: boolean; }

export default function BranchDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError } = useList<Branch>(`/api/settings/branches/${id ?? ''}`);
  const item = (data && !Array.isArray(data)) ? data as Branch : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل الفرع…" />;
  if (isError || !item) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: item.name ?? 'تفاصيل الفرع' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'الاسم', value: item.name }, { label: 'الرمز', value: item.code }, { label: 'المدينة', value: item.city }, { label: 'الحالة', value: item.active ? 'نشط' : 'غير نشط' }].map(row => (
          <View key={row.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{row.value ?? '—'}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
