/**
 * دُفعات استيراد المعتمرين
 * GET /api/umrah/import/batches
 */
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface ImportBatch {
  id: number;
  batchNumber?: string;
  fileName?: string;
  groupName?: string;
  groupId?: number;
  totalRecords?: number;
  matchedRecords?: number;
  unmatchedRecords?: number;
  errorRecords?: number;
  status?: string;
  createdAt?: string;
  processedAt?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function ImportBatchScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<ImportBatch[]>('/api/umrah/import/batches');
  const batches = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل دُفعات الاستيراد…" />;
  if (isError) return (
    <GEmptyState
      icon="alert-circle-outline"
      title="تعذّر التحميل"
      description="تحقق من الاتصال وأعد المحاولة"
      actionLabel="إعادة المحاولة"
      onAction={refetch}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'دُفعات استيراد المعتمرين' }} />
      <FlatList
        data={batches}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <GEmptyState icon="cloud-upload-outline" title="لا توجد دُفعات" description="لا توجد دُفعات استيراد مسجّلة بعد" />
        }
        renderItem={({ item }) => {
          const st = statusBadge(item.status ?? '');
          const hasUnmatched = (item.unmatchedRecords ?? 0) > 0;
          return (
            <Pressable
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderBottomColor: c.border }]}
              onPress={() => router.push({ pathname: '/umrah/import-batch-detail' as never, params: { id: String(item.id) } })}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>
                  {item.batchNumber ?? item.fileName ?? `دُفعة #${item.id}`}
                </Text>
                <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                  {item.groupName ?? '—'} · {fmtDate(item.createdAt)}
                </Text>
                <View style={{ flexDirection: 'row-reverse', marginTop: 4, gap: 12 }}>
                  <Text style={{ fontSize: 11, color: c.textFaint }}>الإجمالي: {item.totalRecords ?? 0}</Text>
                  <Text style={{ fontSize: 11, color: '#22C55E' }}>مُطابَق: {item.matchedRecords ?? 0}</Text>
                  {hasUnmatched && (
                    <Text style={{ fontSize: 11, color: '#EF4444' }}>غير مُطابَق: {item.unmatchedRecords}</Text>
                  )}
                </View>
              </View>
              {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
});
