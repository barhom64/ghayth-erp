import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ImportError {
  id?: number;
  batchId?: number;
  rowNumber?: number;
  field?: string;
  message?: string;
  severity?: string;
  importedAt?: string;
}

export default function ImportErrorsSummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ImportError[]>('/api/umrah/reports/import-errors-summary');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل أخطاء الاستيراد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أخطاء الاستيراد' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد أخطاء" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: item.severity === 'error' ? '#EF4444' : '#F59E0B' }}>{item.message ?? '—'}</Text>
              {item.rowNumber != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>صف {item.rowNumber}</Text> : null}
            </View>
            {item.field ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.field}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
