import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AiProvider {
  id?: number;
  name?: string;
  type?: string;
  status?: string;
  model?: string;
  lastUsed?: string;
}

export default function AiProvidersScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AiProvider[]>('/api/admin/ai/providers');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل مزودي الذكاء الاصطناعي…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مزودو الذكاء الاصطناعي' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="hardware-chip-outline" title="لا يوجد مزودون مهيؤون" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.type ? <Text style={{ fontSize: 11, color: c.brand }}>{item.type}</Text> : null}
              {item.model ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.model}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
