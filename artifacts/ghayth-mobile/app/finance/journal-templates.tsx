import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface JournalTemplate { id?: number; name?: string; description?: string; lineCount?: number; }

export default function JournalTemplatesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<JournalTemplate[]>('/api/finance/journal-templates');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قوالب القيود' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد قوالب" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.name ?? String(item.id ?? '')}</Text>
            {!!item.description && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.description}</Text>}
            {item.lineCount != null && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 2 }}>{item.lineCount} سطر</Text>}
          </View>
        )}
      />
    </View>
  );
}
