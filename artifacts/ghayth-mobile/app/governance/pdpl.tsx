/**
 * الخصوصية وحماية البيانات (PDPL)
 * GET /api/pdpl/requests
 */
import React, { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
import { statusBadge } from '@/lib/moduleSections';

interface PdplRequest {
  id: number;
  requestType?: string;
  subjectName?: string;
  subjectEmail?: string;
  status?: string;
  createdAt?: string;
  resolvedAt?: string;
}

const TYPE_LABEL: Record<string, string> = {
  access: 'طلب اطلاع',
  rectification: 'طلب تصحيح',
  erasure: 'طلب حذف',
  portability: 'طلب نقل البيانات',
  objection: 'اعتراض',
  consent_withdrawal: 'سحب الموافقة',
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function PdplScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const [processing, setProcessing] = useState<number | null>(null);
  const { data, isLoading, isError, refetch } = useList<PdplRequest[]>('/api/pdpl/requests');
  const requests = Array.isArray(data) ? data : [];

  const handleResolve = async (id: number) => {
    Alert.alert('حل الطلب', 'هل تريد تأكيد حل هذا الطلب؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'تأكيد', onPress: async () => {
          setProcessing(id);
          try {
            await apiFetch(`/api/pdpl/requests/${id}/resolve`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) });
            await qc.invalidateQueries({ queryKey: ['/api/pdpl/requests'] });
          } catch {
            Alert.alert('خطأ', 'تعذّر حل الطلب');
          } finally {
            setProcessing(null);
          }
        }
      },
    ]);
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل طلبات الخصوصية…" />;
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
      <Stack.Screen options={{ title: 'حماية البيانات (PDPL)' }} />
      <FlatList
        data={requests}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <GEmptyState icon="shield-checkmark-outline" title="لا توجد طلبات" description="لا توجد طلبات خصوصية نشطة" />
        }
        renderItem={({ item }) => {
          const st = statusBadge(item.status ?? '');
          const isPending = item.status === 'pending' || item.status === 'open';
          return (
            <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>
                  {TYPE_LABEL[item.requestType ?? ''] ?? item.requestType ?? '—'}
                </Text>
                <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                  {item.subjectName ?? item.subjectEmail ?? '—'} · {fmtDate(item.createdAt)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                {st ? <GStatusBadge status={st.label} size="sm" /> : null}
                {isPending && (
                  <Pressable
                    onPress={() => handleResolve(item.id)}
                    disabled={processing === item.id}
                    style={({ pressed }) => [
                      styles.resolveBtn,
                      { backgroundColor: pressed ? c.primary + 'CC' : c.primary, opacity: processing === item.id ? 0.5 : 1 }
                    ]}
                  >
                    <Text style={{ color: c.onPrimary, fontSize: 11, fontWeight: '700' }}>حل</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
  resolveBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
});
