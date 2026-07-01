import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AllocRule { id?: number; name?: string; basis?: string; isActive?: boolean; }

export default function AllocationRulesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AllocRule[]>('/api/finance/allocation-rules');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قواعد التوزيع' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="git-branch-outline" title="لا توجد قواعد" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
              <Text style={{ color: c.text, fontSize: 14 }}>{item.name ?? ''}</Text>
              <Text style={{ color: item.isActive ? '#38a169' : c.textMuted, fontSize: 12 }}>{item.isActive ? 'نشط' : 'غير نشط'}</Text>
            </View>
            {item.basis ? <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>الأساس: {item.basis}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
