/**
 * مركز الاعتماد — قائمة الطلبات المعلقة
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { GScreen, GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, useMutation } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';

type FilterType = 'الكل' | 'إجازات' | 'مشتريات' | 'مالية';

interface ApprovalItem {
  id: number;
  title: string;
  subtitle?: string;
  type: string;
  requestedBy: string;
  createdAt: string;
  status: string;
}

const FILTERS: FilterType[] = ['الكل', 'إجازات', 'مشتريات', 'مالية'];
const typeToFilter: Record<string, FilterType> = {
  leave: 'إجازات',
  purchase: 'مشتريات',
  finance: 'مالية',
};

export default function ApprovalsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterType>('الكل');
  const { data, isLoading, refetch } = useList<ApprovalItem[]>('/api/approvals/pending');

  const approveMutation = useMutation<unknown, { id: number; action: string }>('/api/approvals/action', 'POST');

  const filtered = (data ?? []).filter(item =>
    filter === 'الكل' ? true : typeToFilter[item.type] === filter,
  );

  const handleAction = async (id: number, action: 'approve' | 'reject') => {
    try {
      await approveMutation.mutateAsync({ id, action });
      await qc.invalidateQueries({ queryKey: ['/api/approvals/pending'] });
    } catch { /* يُعرض الخطأ من المتحول */ }
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل الطلبات…" />;

  return (
    <GScreen>
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <GText variant="heading" style={{ paddingHorizontal: 16, paddingTop: 16 }}>مركز الاعتماد</GText>
        {/* فلاتر */}
        <View style={styles.filterRow}>
          {FILTERS.map(f => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterBtn, {
                backgroundColor: filter === f ? c.brand : c.surfaceAlt,
                borderColor: filter === f ? c.brand : c.border,
              }]}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: filter === f ? '#FFF' : c.textMuted }}>{f}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <GEmptyState icon="checkmark-done-circle-outline" title="لا توجد طلبات معلقة" description="ستظهر هنا الطلبات التي تحتاج موافقتك" />
        }
        renderItem={({ item }) => (
          <GCard>
            <View style={styles.itemHeader}>
              <GStatusBadge status={item.status} size="sm" />
              <View style={{ flex: 1, marginRight: 8 }}>
                <GText variant="label" numberOfLines={1}>{item.title}</GText>
                {item.subtitle ? <GText variant="caption" color={c.textMuted}>{item.subtitle}</GText> : null}
              </View>
            </View>
            <View style={styles.itemMeta}>
              <GText variant="caption" color={c.textFaint}>{item.createdAt}</GText>
              <GText variant="caption" color={c.textMuted}>{item.requestedBy}</GText>
            </View>
            <View style={styles.actions}>
              <Pressable
                onPress={() => handleAction(item.id, 'reject')}
                style={[styles.actionBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#B91C1C' }}>رفض</Text>
              </Pressable>
              <Pressable
                onPress={() => handleAction(item.id, 'approve')}
                style={[styles.actionBtn, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#15803D' }}>اعتماد</Text>
              </Pressable>
            </View>
          </GCard>
        )}
      />
    </GScreen>
  );
}

const styles = StyleSheet.create({
  header: { borderBottomWidth: 1, paddingBottom: 12 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 12, flexWrap: 'wrap' },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  itemMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
});
