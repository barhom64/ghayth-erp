import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TemplateField { field?: string; label?: string; required?: boolean; type?: string; }

export default function ImportTemplateScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TemplateField[]>('/api/import/template/employees');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قالب الاستيراد' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.field ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-outline" title="لا توجد حقول" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.label ?? item.field ?? ''}</Text>
            {item.required && <Text style={{ color: c.brand, fontSize: 12 }}>مطلوب</Text>}
          </View>
        )}
      />
    </View>
  );
}
