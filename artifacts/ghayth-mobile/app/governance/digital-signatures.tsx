/**
 * التوقيعات الرقمية — عرض وتتبع
 * GET /api/digital-signatures
 */
import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface DigitalSignature {
  id: number;
  documentRef?: string;
  documentType?: string;
  signerName?: string;
  signerEmail?: string;
  status?: string;
  signedAt?: string;
  expiresAt?: string;
  verificationCode?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function DigitalSignaturesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DigitalSignature[]>('/api/digital-signatures');
  const sigs = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التوقيعات…" />;
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
      <Stack.Screen options={{ title: 'التوقيعات الرقمية' }} />
      <FlatList
        data={sigs}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <GEmptyState icon="create-outline" title="لا توجد توقيعات" description="لا توجد توقيعات رقمية مسجّلة بعد" />
        }
        renderItem={({ item }) => {
          const st = statusBadge(item.status ?? '');
          return (
            <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>
                  {item.documentRef ?? `#${item.id}`}
                </Text>
                <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                  {item.signerName ?? '—'} · {fmtDate(item.signedAt)}
                </Text>
                {item.documentType ? (
                  <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 2 }}>{item.documentType}</Text>
                ) : null}
              </View>
              {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
});
