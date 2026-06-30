import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Category { id?: number; name?: string; description?: string; productCount?: number; parentName?: string; }

export default function WarehouseCategoryDetailScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Category>('/api/warehouse/categories/0');
  const d = (data && !Array.isArray(data)) ? data as Category : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  const rows: [string, string][] = [
    ['الاسم', d.name ?? '-'],
    ['الوصف', d.description ?? '-'],
    ['التصنيف الأب', d.parentName ?? '-'],
    ['عدد المنتجات', String(d.productCount ?? 0)],
  ];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: d.name ?? 'تصنيف المستودع' }} />
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
          <Text style={{ color: c.text, fontSize: 14 }}>{value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
