import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FolderCount {
  folder?: string;
  count?: number;
}

export default function FolderCountsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FolderCount[]>('/api/inbox/folder-counts');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المجلدات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'عدد الرسائل بالمجلدات' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {list.length === 0 ? (
          <GEmptyState icon="folder-outline" title="لا توجد مجلدات" description="" />
        ) : list.map((item, i) => (
          <View key={i} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16, marginBottom: 10, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: c.text, fontWeight: '500' }}>{item.folder ?? '—'}</Text>
            <Text style={{ fontSize: 16, color: c.brand, fontWeight: '700' }}>{item.count ?? 0}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
