import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface GapItem { code?: string; name?: string; reason?: string; }

export default function AccountsUsageGapsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<GapItem[]>('/api/finance/accounts/usage-gaps');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فجوات استخدام الحسابات' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.code ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-done-outline" title="لا توجد فجوات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.code} — {item.name ?? ''}</Text>
            {item.reason ? <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{item.reason}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
