import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ActionItem { id?: number; title?: string; type?: string; priority?: string; dueAt?: string; }

export default function ActionCenter() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ActionItem[]>('/api/action-center');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مركز الإجراءات' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد إجراءات معلقة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 14 }}>{item.title ?? '—'}</Text>
              <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{item.type ?? ''}</Text>
            </View>
            {item.priority === 'high' && <Text style={{ color: '#ef4444', fontSize: 12 }}>عاجل</Text>}
          </View>
        )}
      />
    </View>
  );
}
