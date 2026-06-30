import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface NumberingAuditEntry {
  id?: number;
  schemeCode?: string;
  action?: string;
  actor?: string;
  createdAt?: string;
  note?: string;
}

export default function AdminNumberingAuditScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<NumberingAuditEntry[]>('/api/numbering/audit');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سجل تدقيق الترقيم…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجل تدقيق الترقيم' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد سجلات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>{item.schemeCode ?? '—'}</Text>
              {item.createdAt ? (
                <Text style={{ fontSize: 11, color: c.textMuted }}>
                  {new Date(item.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              ) : null}
            </View>
            <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.actor ?? ''} — {item.action ?? ''}</Text>
            {item.note ? <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2, textAlign: 'right' }}>{item.note}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
