import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PbxExtension {
  id?: number;
  extension?: string;
  displayName?: string;
  status?: string;
  type?: string;
}

export default function AdminPbxControlExtensionsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PbxExtension[]>('/api/admin/pbx-control/extensions');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الامتدادات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'امتدادات PBX' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="call-outline" title="لا توجد امتدادات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.displayName ?? '—'}</Text>
              <Text style={{ fontSize: 13, color: c.brand }}>{item.extension ?? ''}</Text>
            </View>
            {item.type ? <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.type}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
