import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CapaItem { id?: number; title?: string; status?: string; dueDate?: string; assignee?: string; }

export default function GovernanceCapaScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CapaItem[]>('/api/governance/capa');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الإجراءات التصحيحية والوقائية' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="construct-outline" title="لا توجد إجراءات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
              <Text style={{ color: c.text, fontSize: 14 }}>{item.title ?? ''}</Text>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.status ?? ''}</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {item.assignee ? <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.assignee}</Text> : null}
              {item.dueDate ? <Text style={{ color: c.textMuted, fontSize: 12 }}>{new Date(item.dueDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
