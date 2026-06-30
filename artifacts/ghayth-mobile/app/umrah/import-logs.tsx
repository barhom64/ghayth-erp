import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ImportLogItem {
  id?: number;
  fileName?: string;
  status?: string;
  totalRows?: number;
  successRows?: number;
  errorRows?: number;
  createdAt?: string;
}

function fmtDate(val?: string) {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function UmrahImportLogsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ImportLogItem[]>('/api/umrah/import-logs');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سجلات الاستيراد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجلات الاستيراد — عمرة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cloud-upload-outline" title="لا توجد سجلات استيراد" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.fileName ?? `استيراد #${item.id}`}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.successRows != null ? <Text style={{ fontSize: 11, color: '#22C55E' }}>نجح: {item.successRows}</Text> : null}
              {item.errorRows != null ? <Text style={{ fontSize: 11, color: '#EF4444' }}>خطأ: {item.errorRows}</Text> : null}
              <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.createdAt)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
