import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Variable { id?: number; key?: string; label?: string; type?: string; }

export default function TemplateVariablesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Variable[]>('/api/documents/templates/0/variables');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'متغيرات القالب' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="code-outline" title="لا توجد متغيرات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14, fontFamily: 'monospace' }}>{item.key ?? String(item.id ?? '')}</Text>
            {item.label && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{item.label}</Text>}
            {item.type && <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.type}</Text>}
          </View>
        )}
      />
    </View>
  );
}
