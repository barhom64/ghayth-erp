import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FieldDefinition { id?: number; name?: string; fieldType?: string; entity?: string; required?: boolean; }

export default function CustomFieldDefinitions() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FieldDefinition[]>('/api/custom-fields/definitions');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تعريفات الحقول المخصصة' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="options-outline" title="لا توجد تعريفات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: c.text, fontSize: 14 }}>{item.name ?? '—'}</Text>
              <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.entity ?? ''} · {item.fieldType ?? ''}</Text>
            </View>
            {item.required && <Text style={{ color: '#ef4444', fontSize: 12 }}>مطلوب</Text>}
          </View>
        )}
      />
    </View>
  );
}
