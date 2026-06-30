import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PredefinedRole {
  key?: string;
  name?: string;
  description?: string;
  level?: number;
  featureCount?: number;
  domain?: string;
}

export default function PredefinedRolesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PredefinedRole[]>('/api/admin/predefined-roles');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الأدوار المعرّفة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الأدوار المعرّفة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.key ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="person-outline" title="لا توجد أدوار" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.name ?? item.key ?? '—'}</Text>
              {item.level != null ? <Text style={{ fontSize: 12, color: c.brand }}>مستوى: {item.level}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 14 }}>
              {item.domain ? <Text style={{ fontSize: 11, color: c.textMuted }}>النطاق: {item.domain}</Text> : null}
              {item.featureCount != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>صلاحيات: {item.featureCount}</Text> : null}
            </View>
            {item.description ? <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 4 }}>{item.description}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
