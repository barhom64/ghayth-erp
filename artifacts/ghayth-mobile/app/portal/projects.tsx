import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PortalProject {
  id?: number;
  name?: string;
  status?: string;
  progress?: number;
  startDate?: string;
  endDate?: string;
}

export default function PortalProjectsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PortalProject[]>('/api/portal/projects');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المشاريع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مشاريعي' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="folder-outline" title="لا توجد مشاريع" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>
                {item.name ?? '—'}
              </Text>
              {item.status ? <GStatusBadge status={item.status} /> : null}
            </View>
            {item.progress != null ? (
              <View style={{ marginTop: 8 }}>
                <View style={{ backgroundColor: c.border, borderRadius: 4, height: 4 }}>
                  <View style={{ backgroundColor: c.brand, borderRadius: 4, height: 4, width: `${Math.min(item.progress, 100)}%` }} />
                </View>
                <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>{item.progress}%</Text>
              </View>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
