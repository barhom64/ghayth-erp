import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SubsidiaryFailure { id?: number; reason?: string; entityType?: string; entityId?: number; createdAt?: string; }

export default function SubsidiaryAccountFailuresScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SubsidiaryFailure[]>('/api/finance/subsidiary-account-failures');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أخطاء الحسابات الفرعية' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد أخطاء" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: '#ef4444', fontSize: 14 }}>{item.reason ?? ''}</Text>
            {!!item.entityType && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.entityType} #{item.entityId}</Text>}
            {!!item.createdAt && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 2 }}>{new Date(item.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
          </View>
        )}
      />
    </View>
  );
}
