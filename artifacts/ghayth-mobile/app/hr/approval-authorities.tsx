import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ApprovalAuthority {
  id?: number;
  employeeName?: string;
  entityType?: string;
  maxAmount?: number;
  level?: string;
}

export default function ApprovalAuthoritiesScreen() {
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
        ListEmptyComponent={<GEmptyState icon="shield-checkmark-outline" title="لا توجد صلاحيات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.employeeName ?? '—'}</Text>
              <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 2 }}>
                {item.entityType ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.entityType}</Text> : null}
                {item.level ? <Text style={{ fontSize: 11, color: c.brand }}>{item.level}</Text> : null}
              </View>
            </View>
            {item.maxAmount != null ? (
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.maxAmount.toLocaleString('ar-SA')}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
