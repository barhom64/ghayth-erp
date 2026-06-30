import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CustomFieldValue {
  id?: number;
  fieldKey?: string;
  entityType?: string;
  entityId?: number;
  value?: string;
}

export default function SettingsCustomFieldValuesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CustomFieldValue[]>('/api/custom-fields/values');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل قيم الحقول المخصصة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قيم الحقول المخصصة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="list-outline" title="لا توجد قيم" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>{item.fieldKey ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>{item.entityType ?? ''}</Text>
            </View>
            {item.value ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.value}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
