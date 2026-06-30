import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RbacMatrixRow {
  roleKey?: string;
  roleName?: string;
  featureCount?: number;
  userCount?: number;
  domain?: string;
}

export default function RbacMatrixScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RbacMatrixRow[]>('/api/admin/governance/rbac-matrix');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل مصفوفة الصلاحيات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مصفوفة الصلاحيات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.roleKey ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="key-outline" title="لا توجد أدوار" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.roleName ?? item.roleKey ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: c.brand }}>{item.featureCount ?? 0} صلاحية</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.domain ? <Text style={{ fontSize: 11, color: c.textMuted }}>النطاق: {item.domain}</Text> : null}
              <Text style={{ fontSize: 11, color: c.textMuted }}>مستخدمون: {item.userCount ?? 0}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
