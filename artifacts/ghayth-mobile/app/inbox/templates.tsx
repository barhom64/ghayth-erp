import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface InboxTemplate { id?: number; name?: string; subject?: string; channel?: string; isActive?: boolean; }

export default function InboxTemplates() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<InboxTemplate[]>('/api/inbox/templates');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قوالب الصندوق' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد قوالب" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.name ?? ''}</Text>
            {!!item.subject && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.subject}</Text>}
            {!!item.channel && <Text style={{ color: c.brand, fontSize: 12, marginTop: 2 }}>{item.channel}</Text>}
          </View>
        )}
      />
    </View>
  );
}
