import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AccountGap {
  code?: string;
  name?: string;
  gapType?: string;
  description?: string;
}

export default function AccountsGapsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AccountGap[]>('/api/accounts/usage-gaps');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل فجوات الحسابات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فجوات استخدام الحسابات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => item.code ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد فجوات في الحسابات" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, borderRightWidth: 3, borderRightColor: '#EF4444', padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.name ?? item.code ?? '—'}</Text>
              {item.code ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.code}</Text> : null}
            </View>
            {item.gapType ? <Text style={{ fontSize: 11, color: '#EF4444', textAlign: 'right' }}>{item.gapType}</Text> : null}
            {item.description ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right' }}>{item.description}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
