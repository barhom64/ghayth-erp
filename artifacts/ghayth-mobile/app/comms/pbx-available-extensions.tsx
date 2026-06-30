import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PbxExtensionsData {
  available?: { id?: number; extension?: string; name?: string }[];
  nextExtension?: string;
  hasPbx?: boolean;
  [key: string]: unknown;
}

export default function PbxAvailableExtensionsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PbxExtensionsData>('/api/communications/provisioning/extensions');
  const resp = (data && !Array.isArray(data)) ? data as PbxExtensionsData : null;
  const list = resp?.available ?? [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التحويلات المتاحة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تحويلات PBX المتاحة' }} />
      {resp?.nextExtension ? (
        <View style={{ backgroundColor: c.surface, margin: 12, borderRadius: 8, padding: 12, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: c.textMuted }}>التحويل التالي المقترح</Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.brand }}>{resp.nextExtension}</Text>
        </View>
      ) : null}
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="call-outline" title="لا توجد تحويلات متاحة" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: c.text }}>{item.name ?? '—'}</Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: c.brand }}>{item.extension}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
