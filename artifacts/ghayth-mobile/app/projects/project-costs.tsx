import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ProjectCost {
  id?: number;
  category?: string;
  description?: string;
  budgeted?: number;
  actual?: number;
  variance?: number;
}

export default function ProjectCostsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ProjectCost[]>('/api/projects/0/costs');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تكاليف المشروع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تكاليف المشروع' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cash-outline" title="لا توجد تكاليف" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>
                {item.description ?? item.category ?? '—'}
              </Text>
              {item.variance != null ? (
                <Text style={{ fontSize: 13, color: (item.variance) <= 0 ? '#22C55E' : '#EF4444', fontWeight: '600' }}>
                  {Number(item.variance).toLocaleString('ar-SA')} ر.س
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ fontSize: 12, color: c.textMuted }}>مقدّر: {Number(item.budgeted ?? 0).toLocaleString('ar-SA')}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>فعلي: {Number(item.actual ?? 0).toLocaleString('ar-SA')}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
