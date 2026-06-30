import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ProjectUnit {
  id?: number;
  unitNumber?: string;
  type?: string;
  area?: number;
  status?: string;
  price?: number;
}

export default function ProjectUnitsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ProjectUnit[]>('/api/projects/0/units');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل وحدات المشروع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'وحدات المشروع' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="grid-outline" title="لا توجد وحدات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>
                {item.unitNumber ?? '—'} {item.type ? `— ${item.type}` : ''}
              </Text>
              {item.status ? <GStatusBadge status={item.status} /> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              {item.area != null ? (
                <Text style={{ fontSize: 12, color: c.textMuted }}>المساحة: {item.area} م²</Text>
              ) : null}
              {item.price != null ? (
                <Text style={{ fontSize: 12, color: c.brand }}>{Number(item.price).toLocaleString('ar-SA')} ر.س</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
