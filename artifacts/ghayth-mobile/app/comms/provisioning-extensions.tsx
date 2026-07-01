import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Extension { extension?: string; name?: string; status?: string; }

export default function ProvisioningExtensions() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Extension[]>('/api/communications/provisioning/extensions');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل الامتدادات…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'امتدادات PBX' }} />
      <FlatList
        data={list} keyExtractor={(item, i) => item.extension ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="call-outline" title="لا توجد امتدادات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.extension} — {item.name ?? '—'}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.status ?? ''}</Text>
          </View>
        )}
      />
    </View>
  );
}
