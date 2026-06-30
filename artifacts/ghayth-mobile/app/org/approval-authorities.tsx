import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ApprovalAuthority {
  id?: number;
  roleName?: string;
  feature?: string;
  maxAmount?: number;
  level?: number;
}

export default function OrgApprovalAuthoritiesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ApprovalAuthority[]>('/api/org/approval-authorities');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل صلاحيات الاعتماد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'صلاحيات الاعتماد' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد صلاحيات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.roleName ?? '—'}</Text>
              {item.feature ? <Text style={{ fontSize: 12, color: c.brand, marginTop: 2 }}>{item.feature}</Text> : null}
              {item.level != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>مستوى {item.level}</Text> : null}
            </View>
            {item.maxAmount != null ? (
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.maxAmount.toLocaleString('ar-SA')} ر.س</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
