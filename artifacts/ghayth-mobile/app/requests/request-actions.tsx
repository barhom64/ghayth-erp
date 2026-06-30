import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RequestAction { id?: number; action?: string; actor?: string; date?: string; comment?: string; }

export default function RequestActionsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RequestAction[]>('/api/requests/0/actions');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إجراءات الطلب' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="git-branch-outline" title="لا توجد إجراءات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.action ?? String(item.id ?? '')}</Text>
            {item.actor && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{item.actor}</Text>}
            {item.comment && <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.comment}</Text>}
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
