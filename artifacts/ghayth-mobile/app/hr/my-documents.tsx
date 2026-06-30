/**
 * وثائقي — عرض وثائق الموظف الشخصية من /api/my-space/documents
 */
import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { Ionicons } from '@expo/vector-icons';

interface DocRow {
  id: number;
  type?: string;
  title?: string;
  url?: string;
  expiryDate?: string | null;
  createdAt: string;
}

interface DocsResp { data?: DocRow[] }

const TYPE_LABELS: Record<string, string> = {
  passport: 'جواز سفر',
  iqama: 'إقامة',
  id_card: 'هوية وطنية',
  contract: 'عقد عمل',
  certificate: 'شهادة',
  other: 'أخرى',
};

function formatDate(val?: string | null): string {
  if (!val) return '';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function daysUntilExpiry(val?: string | null): number | null {
  if (!val) return null;
  const diff = new Date(val).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

export default function MyDocumentsScreen() {
  const c = useColors();
  const { data: resp, isLoading, isError, refetch } = useList<DocsResp>('/api/my-space/documents');
  const rows = resp?.data ?? [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الوثائق…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر تحميل الوثائق" description="تحقق من اتصالك وحاول مجدداً" actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={styles.container}
      data={rows}
      keyExtractor={r => String(r.id)}
      onRefresh={refetch}
      refreshing={isLoading}
      ListHeaderComponent={<Stack.Screen options={{ title: 'وثائقي' }} />}
      ListEmptyComponent={
        <GEmptyState icon="document-outline" title="لا توجد وثائق" description="لم يتم تحميل أي وثائق بعد" />
      }
      renderItem={({ item }) => {
        const days = daysUntilExpiry(item.expiryDate);
        const expirySoon = days !== null && days >= 0 && days <= 60;
        const expired = days !== null && days < 0;
        return (
          <GCard style={styles.docCard}>
            <View style={styles.docRow}>
              <View style={[styles.docIcon, { backgroundColor: expired ? '#FEF2F2' : expirySoon ? '#FFFBEB' : c.surfaceAlt }]}>
                <Ionicons
                  name="document-text-outline"
                  size={22}
                  color={expired ? '#EF4444' : expirySoon ? '#F59E0B' : c.brand}
                />
              </View>
              <View style={{ flex: 1 }}>
                <GText variant="label" numberOfLines={1}>{item.title ?? '—'}</GText>
                <GText variant="caption" color={c.textMuted}>{TYPE_LABELS[item.type ?? ''] ?? item.type ?? 'وثيقة'}</GText>
              </View>
            </View>
            <View style={styles.metaRow}>
              {item.expiryDate ? (
                <Text style={{ fontSize: 12, color: expired ? '#EF4444' : expirySoon ? '#F59E0B' : c.textMuted }}>
                  {expired
                    ? `منتهية منذ ${Math.abs(days!)} يوم`
                    : expirySoon
                    ? `تنتهي خلال ${days} يوم`
                    : `تنتهي: ${formatDate(item.expiryDate)}`}
                </Text>
              ) : null}
              <Text style={{ fontSize: 11, color: c.textFaint }}>{formatDate(item.createdAt)}</Text>
            </View>
          </GCard>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, gap: 10, paddingBottom: 40 },
  docCard: { gap: 8 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  docIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
