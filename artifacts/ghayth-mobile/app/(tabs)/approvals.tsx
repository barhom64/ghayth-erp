/**
 * مركز الاعتماد — قائمة الطلبات المعلقة
 * البيانات من /api/my-space → pendingApprovals
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { GScreen, GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
import { statusBadge } from '@/lib/moduleSections';

type FilterType = 'الكل' | 'إجازات' | 'سلف' | 'وقت إضافي' | 'نهاية خدمة';

interface ApprovalItem {
  id: number;
  title: string;
  type: 'leave' | 'loan' | 'overtime' | 'exit';
  employeeName: string;
  status: string;
  createdAt: string;
}

interface MySpaceData {
  pendingApprovals?: ApprovalItem[];
}

const FILTERS: FilterType[] = ['الكل', 'إجازات', 'سلف', 'وقت إضافي', 'نهاية خدمة'];
const typeToFilter: Record<string, FilterType> = {
  leave: 'إجازات',
  loan: 'سلف',
  overtime: 'وقت إضافي',
  exit: 'نهاية خدمة',
};

function approveEndpoint(item: ApprovalItem, approved: boolean): string {
  switch (item.type) {
    case 'leave':    return `/api/hr/leave-requests/${item.id}/approve`;
    case 'loan':     return `/api/hr/loans/${item.id}/${approved ? 'approve' : 'reject'}`;
    case 'overtime': return `/api/hr/overtime/${item.id}/${approved ? 'approve' : 'reject'}`;
    case 'exit':     return `/api/hr/transfers/${item.id}/approve`;
  }
}

export default function ApprovalsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterType>('الكل');
  const [inFlight, setInFlight] = useState<number | null>(null);
  const { data, isLoading, refetch } = useList<MySpaceData>('/api/my-space');

  const items = data?.pendingApprovals ?? [];
  const filtered = items.filter(item =>
    filter === 'الكل' ? true : typeToFilter[item.type] === filter,
  );

  const handleAction = async (item: ApprovalItem, approved: boolean) => {
    setInFlight(item.id);
    try {
      const endpoint = approveEndpoint(item, approved);
      await apiFetch(endpoint, {
        method: 'PATCH',
        body: JSON.stringify({ approved }),
      });
      await qc.invalidateQueries({ queryKey: ['/api/my-space'] });
      await refetch();
    } catch { /* خطأ مرئي للمستخدم — تُعرض في UI الإجراء */ }
    finally {
      setInFlight(null);
    }
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
        keyExtractor={item => `${item.type}-${item.id}`}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <GEmptyState icon="checkmark-done-circle-outline" title="لا توجد طلبات معلقة" description="ستظهر هنا الطلبات التي تحتاج موافقتك" />
        }
        renderItem={({ item }) => {
          const busy = inFlight === item.id;
          return (
            <GCard>
              <View style={styles.itemHeader}>
                <GStatusBadge status={statusBadge(item.status)?.label ?? item.status} size="sm" />
                <View style={{ flex: 1, marginRight: 8 }}>
                  <GText variant="label" numberOfLines={1}>{item.title}</GText>
                  <GText variant="caption" color={c.textMuted}>{item.employeeName}</GText>
                </View>
              </View>
              <View style={styles.itemMeta}>
                <GText variant="caption" color={c.textFaint}>{item.createdAt}</GText>
                <GText variant="caption" color={c.textMuted}>{typeToFilter[item.type] ?? item.type}</GText>
              </View>
              <View style={styles.actions}>
                <Pressable
                  onPress={() => !busy && handleAction(item, false)}
                  style={[styles.actionBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA', opacity: busy ? 0.5 : 1 }]}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#B91C1C' }}>رفض</Text>
                </Pressable>
                <Pressable
                  onPress={() => !busy && handleAction(item, true)}
                  style={[styles.actionBtn, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', opacity: busy ? 0.5 : 1 }]}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#15803D' }}>اعتماد</Text>
                </Pressable>
              </View>
            </GCard>
          );
        }}
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
