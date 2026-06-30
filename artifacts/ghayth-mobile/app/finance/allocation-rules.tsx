import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AllocationRule {
  id?: number;
  name?: string;
  sourceAccount?: string;
  method?: string;
  isActive?: boolean;
}

export default function AllocationRulesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AllocationRule[]>('/api/allocation-rules');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل قواعد التوزيع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قواعد توزيع التكاليف' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="git-branch-outline" title="لا توجد قواعد توزيع" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, opacity: item.isActive === false ? 0.5 : 1 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.name ?? '—'}</Text>
              <Text style={{ fontSize: 11, color: item.isActive !== false ? '#22C55E' : c.textFaint }}>{item.isActive !== false ? 'نشط' : 'غير نشط'}</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.sourceAccount ? <Text style={{ fontSize: 11, color: c.textMuted }}>الحساب: {item.sourceAccount}</Text> : null}
              {item.method ? <Text style={{ fontSize: 11, color: c.brand }}>{item.method}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
