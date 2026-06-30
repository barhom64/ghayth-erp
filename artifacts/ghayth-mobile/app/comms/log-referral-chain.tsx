import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ChainItem { id?: number; type?: string; target?: string; status?: string; }

export default function LogReferralChainScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ChainItem[]>('/api/communications/log/0/referral-chain');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سلسلة الإحالة' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="git-branch-outline" title="لا توجد إحالات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.type ?? String(item.id ?? '')}</Text>
            {item.target && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{item.target}</Text>}
            {item.status && <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.status}</Text>}
          </View>
        )}
      />
    </View>
  );
}
