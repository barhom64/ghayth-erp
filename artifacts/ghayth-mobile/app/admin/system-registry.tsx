import React from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SystemRegistryItem {
  domain?: string;
  entityCount?: number;
  apiCount?: number;
  pageCount?: number;
  coveragePct?: number;
}

export default function SystemRegistryScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SystemRegistryItem[]>('/api/admin/system-registry');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سجل النظام…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجل النظام' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {list.length === 0 ? <GEmptyState icon="grid-outline" title="لا توجد بيانات سجل" description="" /> : null}
        {list.map((item, i) => (
          <Pressable key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 8 }}>{item.domain ?? '—'}</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.entityCount != null ? <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: c.textMuted }}>كيانات</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>{item.entityCount}</Text>
              </View> : null}
              {item.apiCount != null ? <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: c.textMuted }}>APIs</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>{item.apiCount}</Text>
              </View> : null}
              {item.pageCount != null ? <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: c.textMuted }}>صفحات</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>{item.pageCount}</Text>
              </View> : null}
              {item.coveragePct != null ? <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: c.textMuted }}>التغطية</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: (item.coveragePct ?? 0) >= 80 ? '#22C55E' : '#F59E0B' }}>{item.coveragePct.toFixed(0)}%</Text>
              </View> : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
