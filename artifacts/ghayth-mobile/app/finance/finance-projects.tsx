import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FinanceProject { id?: number; name?: string; budget?: number; spent?: number; status?: string; }

export default function FinanceProjects() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FinanceProject[]>('/api/finance/projects');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مشاريع المالية' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="folder-outline" title="لا توجد مشاريع" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
              <Text style={{ color: c.text, fontSize: 14 }}>{item.name ?? '—'}</Text>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.status ?? ''}</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>الميزانية: {item.budget?.toLocaleString('ar-SA') ?? '—'} ر.س</Text>
              <Text style={{ color: c.brand, fontSize: 12 }}>المصروف: {item.spent?.toLocaleString('ar-SA') ?? '—'} ر.س</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
