import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Department {
  id?: number;
  name?: string;
  code?: string;
  managerName?: string;
  employeesCount?: number;
  parentName?: string;
}

export default function DepartmentsSettingsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Department[]>('/api/settings/departments');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الأقسام…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الأقسام' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="business-outline" title="لا توجد أقسام" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
              <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 2 }}>
                {item.code ? <Text style={{ fontSize: 11, color: c.brand }}>{item.code}</Text> : null}
                {item.managerName ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.managerName}</Text> : null}
              </View>
            </View>
            {item.employeesCount != null ? (
              <Text style={{ fontSize: 13, color: c.text, fontWeight: '600' }}>{item.employeesCount}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
