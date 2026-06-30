import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UnlinkedSubAgent {
  id?: number;
  name?: string;
  phone?: string;
  country?: string;
  registeredAt?: string;
}

export default function UmrahSubAgentsUnlinkedScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<UnlinkedSubAgent[]>('/api/umrah/sub-agents/unlinked');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الوكلاء غير المرتبطين…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'وكلاء غير مرتبطين' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="جميع الوكلاء مرتبطون" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
            {item.phone ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.phone}</Text> : null}
            {item.country ? <Text style={{ fontSize: 12, color: c.brand, marginTop: 2 }}>{item.country}</Text> : null}
            {item.registeredAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>
                {new Date(item.registeredAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
