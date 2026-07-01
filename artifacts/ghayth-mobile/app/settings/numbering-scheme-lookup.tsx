import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LookupItem { schemeId?: number; schemeName?: string; entityType?: string; prefix?: string; }

export default function NumberingSchemeLookup() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<LookupItem[]>('/api/numbering/scheme-lookup');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'بحث مخططات الترقيم' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.schemeId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="search-outline" title="لا توجد مخططات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.schemeName ?? String(item.schemeId ?? '')}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.entityType ?? ''}{item.prefix ? ` — ${item.prefix}` : ''}</Text>
          </View>
        )}
      />
    </View>
  );
}
