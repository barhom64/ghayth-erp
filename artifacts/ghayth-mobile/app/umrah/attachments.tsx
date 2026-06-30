import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UmrahAttachment {
  id?: number;
  fileName?: string;
  fileType?: string;
  entityType?: string;
  entityId?: number;
  uploadedAt?: string;
}

export default function UmrahAttachmentsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<UmrahAttachment[]>('/api/umrah/attachments');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المرفقات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مرفقات العمرة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="attach-outline" title="لا توجد مرفقات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.fileName ?? '—'}</Text>
              {item.entityType ? <Text style={{ fontSize: 12, color: c.brand, marginTop: 2 }}>{item.entityType} #{item.entityId}</Text> : null}
              {item.fileType ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.fileType}</Text> : null}
            </View>
            {item.uploadedAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint }}>
                {new Date(item.uploadedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
