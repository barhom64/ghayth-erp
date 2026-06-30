import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ProjectResource {
  id?: number;
  employeeName?: string;
  role?: string;
  allocation?: number;
  startDate?: string;
  endDate?: string;
}

export default function ProjectResourcesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ProjectResource[]>('/api/projects/0/resources');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل موارد المشروع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'موارد المشروع' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا توجد موارد" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.employeeName ?? '—'}</Text>
              {item.allocation != null ? (
                <Text style={{ fontSize: 13, color: c.brand, fontWeight: '600' }}>{item.allocation}%</Text>
              ) : null}
            </View>
            {item.role ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.role}</Text>
            ) : null}
            {(item.startDate || item.endDate) ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, textAlign: 'right' }}>
                {item.startDate ? new Date(item.startDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'} — {item.endDate ? new Date(item.endDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
