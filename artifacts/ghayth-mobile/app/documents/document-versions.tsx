import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DocumentVersion {
  id?: number;
  version?: string;
  uploadedByName?: string;
  createdAt?: string;
  fileSize?: number;
  comment?: string;
}

export default function DocumentVersionsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DocumentVersion[]>('/api/documents/0/versions');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل إصدارات المستند…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إصدارات المستند' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-outline" title="لا توجد إصدارات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>إصدار {item.version ?? '—'}</Text>
              {item.fileSize != null ? (
                <Text style={{ fontSize: 12, color: c.textMuted }}>{(item.fileSize / 1024).toFixed(0)} KB</Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              {item.uploadedByName ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.uploadedByName}</Text> : null}
              {item.createdAt ? (
                <Text style={{ fontSize: 12, color: c.textMuted }}>
                  {new Date(item.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              ) : null}
            </View>
            {item.comment ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, textAlign: 'right' }}>{item.comment}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
