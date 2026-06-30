import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AccessEntry { id?: number; actor?: string; action?: string; date?: string; }

export default function DocumentAccessLogScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AccessEntry[]>('/api/documents/0/access-log');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجل الوصول للمستند' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="eye-outline" title="لا يوجد سجل" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.actor ?? String(item.id ?? '')}</Text>
            {item.action && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{item.action}</Text>}
            {item.date && (
              <Text style={{ color: c.textMuted, fontSize: 12 }}>
                {new Date(item.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}
