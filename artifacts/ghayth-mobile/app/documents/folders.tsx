/**
 * مجلدات الوثائق
 * GET /api/documents/folders
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DocumentFolder {
  id: number;
  name?: string;
  parentName?: string;
  documentCount?: number;
  accessLevel?: string;
  createdAt?: string;
}

export default function DocumentFoldersScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DocumentFolder[]>('/api/documents/folders');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المجلدات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مجلدات الوثائق' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="folder-outline" title="لا توجد مجلدات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              {item.documentCount != null ? (
                <Text style={{ fontSize: 12, color: c.brand, fontWeight: '700' }}>{item.documentCount} وثيقة</Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.parentName ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.parentName}</Text> : null}
              {item.accessLevel ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.accessLevel}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
