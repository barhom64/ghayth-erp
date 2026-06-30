import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ManualJournal {
  id?: number;
  description?: string;
  date?: string;
  totalDebit?: number;
  status?: string;
  createdByName?: string;
  reference?: string;
}

export default function JournalManualScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ManualJournal[]>('/api/finance/journal-manual');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل القيود اليدوية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'القيود اليدوية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="create-outline" title="لا توجد قيود يدوية" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>{item.description ?? '—'}</Text>
              <Text style={{ fontSize: 13, color: c.brand, fontWeight: '600' }}>
                {Number(item.totalDebit ?? 0).toLocaleString('ar-SA')} ر.س
              </Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              <Text style={{ fontSize: 12, color: c.textMuted }}>
                {item.date ? new Date(item.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </Text>
              {item.status ? <GStatusBadge status={item.status} /> : null}
            </View>
            {item.createdByName ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, textAlign: 'right' }}>{item.createdByName}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
