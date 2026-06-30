import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RegistryPage {
  id?: number;
  path?: string;
  title?: string;
  domain?: string;
  hasRbac?: boolean;
  isLinked?: boolean;
}

export default function SystemRegistryPagesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RegistryPage[]>('/api/admin/system-registry/pages');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل صفحات السجل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'صفحات سجل النظام' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="browsers-outline" title="لا توجد صفحات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.title ?? item.path ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: c.brand }}>{item.domain ?? ''}</Text>
            </View>
            {item.path ? <Text style={{ fontSize: 11, color: c.textMuted, fontFamily: 'monospace' }}>{item.path}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.hasRbac ? <Text style={{ fontSize: 11, color: '#22C55E' }}>✓ RBAC</Text> : <Text style={{ fontSize: 11, color: '#EF4444' }}>✗ RBAC</Text>}
              {item.isLinked ? <Text style={{ fontSize: 11, color: '#22C55E' }}>✓ مربوطة</Text> : <Text style={{ fontSize: 11, color: '#F59E0B' }}>✗ غير مربوطة</Text>}
            </View>
          </View>
        )}
      />
    </View>
  );
}
