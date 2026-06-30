import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PrintTemplate {
  id: number;
  name?: string;
  entityType?: string;
  format?: string;
  isDefault?: boolean;
}

export default function PrintTemplatesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PrintTemplate[]>('/api/print/templates');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل قوالب الطباعة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قوالب الطباعة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="print-outline" title="لا توجد قوالب طباعة" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              {item.isDefault ? <Text style={{ fontSize: 11, color: '#22C55E', fontWeight: '600' }}>افتراضي</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.entityType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.entityType}</Text> : null}
              {item.format ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.format}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
