import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface JournalEntry { id?: number; ref?: string; description?: string; totalDebit?: number; postingDate?: string; status?: string; }

export default function JournalEntriesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<JournalEntry[]>('/api/finance/journal');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'القيود المحاسبية' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="book-outline" title="لا توجد قيود" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: c.text, fontSize: 14 }}>{item.ref ?? String(item.id ?? '')}</Text>
              {item.totalDebit != null && <Text style={{ color: c.brand, fontSize: 14, fontWeight: '600' }}>{item.totalDebit.toLocaleString('ar-SA')}</Text>}
            </View>
            {!!item.description && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.description}</Text>}
            {!!item.postingDate && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 2 }}>{new Date(item.postingDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
          </View>
        )}
      />
    </View>
  );
}
