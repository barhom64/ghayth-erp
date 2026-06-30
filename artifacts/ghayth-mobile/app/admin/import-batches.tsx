import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ImportBatch {
  id: number;
  entity?: string;
  fileName?: string;
  totalRows?: number;
  successRows?: number;
  errorRows?: number;
  status?: string;
  createdAt?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function ImportBatchesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ImportBatch[]>('/api/import/batches');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل دفعات الاستيراد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'دفعات الاستيراد' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cloud-upload-outline" title="لا توجد دفعات استيراد" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.entity ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.entity}</Text> : null}
              <Text style={{ fontSize: 12, color: c.textMuted, flex: 1, textAlign: 'right' }} numberOfLines={1}>{item.fileName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.totalRows != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>الكل: {item.totalRows}</Text> : null}
              {item.successRows != null ? <Text style={{ fontSize: 11, color: '#22C55E' }}>ناجح: {item.successRows}</Text> : null}
              {item.errorRows != null && item.errorRows > 0 ? <Text style={{ fontSize: 11, color: '#EF4444' }}>خطأ: {item.errorRows}</Text> : null}
              {item.createdAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.createdAt)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
