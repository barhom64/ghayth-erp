/**
 * مركز الاعتماد — قائمة الطلبات المعلقة
 * البيانات من /api/my-space → pendingApprovals
 */
import React, { useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { GScreen, GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
import { canApprove } from '@/lib/modules';
import { useAuth } from '@/context/AuthContext';
import { statusBadge } from '@/lib/moduleSections';

type FilterType = 'الكل' | 'إجازات' | 'سلف' | 'وقت إضافي' | 'نهاية خدمة' | 'استئذان';

interface ApprovalItem {
  id: number;
  title: string;
  type: 'leave' | 'loan' | 'overtime' | 'exit' | 'excuse';
  employeeName: string;
  status: string;
  createdAt: string;
}

interface MySpaceData {
  pendingApprovals?: ApprovalItem[];
}

interface ExcuseItem {
  id: number;
  employeeName?: string;
  excuseDate?: string;
  excuseType?: string;
  status: string;
  createdAt: string;
}
interface ExcuseResp { data?: ExcuseItem[] }

function formatDateAr(val: string): string {
  if (!val) return '';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

const FILTERS: FilterType[] = ['الكل', 'إجازات', 'سلف', 'وقت إضافي', 'نهاية خدمة', 'استئذان'];
const typeToFilter: Record<string, FilterType> = {
  leave: 'إجازات',
  loan: 'سلف',
  overtime: 'وقت إضافي',
  exit: 'نهاية خدمة',
  excuse: 'استئذان',
};

function approveEndpoint(item: ApprovalItem, approved: boolean): string | null {
  switch (item.type) {
    case 'leave':    return `/api/hr/leave-requests/${item.id}/approve`;
    case 'loan':     return `/api/hr/loans/${item.id}/${approved ? 'approve' : 'reject'}`;
    case 'overtime': return `/api/hr/overtime/${item.id}/${approved ? 'approve' : 'reject'}`;
    case 'exit':     return `/api/hr/transfers/${item.id}/approve`;
    case 'excuse':   return `/api/hr/excuse-requests/${item.id}/approve`;
    default:         return null;
  }
}

export default function ApprovalsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterType>('الكل');
  const [inFlight, setInFlight] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ApprovalItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const { data, isLoading, isError, refetch } = useList<MySpaceData>('/api/my-space');
  const isManager = canApprove(user?.userRoles);
  const { data: excuseResp } = useList<ExcuseResp>('/api/hr/excuse-requests', isManager ? { status: 'pending' } : undefined, { enabled: isManager });

  const pendingExcuses: ApprovalItem[] = isManager
    ? (excuseResp?.data ?? []).map((e: ExcuseItem) => ({
        id: e.id,
        title: `استئذان ${e.excuseType ?? ''} — ${e.excuseDate ?? ''}`,
        type: 'excuse' as const,
        employeeName: e.employeeName ?? '',
        status: e.status,
        createdAt: e.createdAt,
      }))
    : [];

  const items = [...(data?.pendingApprovals ?? []), ...pendingExcuses]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const filtered = items.filter(item =>
    filter === 'الكل' ? true : typeToFilter[item.type] === filter,
  );

  const doAction = async (item: ApprovalItem, approved: boolean, rejectionReason?: string) => {
    const endpoint = approveEndpoint(item, approved);
    if (!endpoint) {
      Alert.alert('خطأ', `نوع طلب غير مدعوم: ${item.type}`);
      return;
    }
    setInFlight(item.id);
    try {
      const body: Record<string, unknown> = { approved };
      if (!approved && rejectionReason) body.rejectionReason = rejectionReason;
      await apiFetch(endpoint, { method: 'PATCH', body: JSON.stringify(body) });
      await qc.invalidateQueries({ queryKey: ['/api/my-space'] });
      await qc.invalidateQueries({ queryKey: ['/api/hr/excuse-requests'] });
      await refetch();
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر تنفيذ الإجراء');
    } finally {
      setInFlight(null);
    }
  };

  const handleAction = (item: ApprovalItem, approved: boolean) => {
    if (!approved && item.type === 'excuse') {
      setRejectTarget(item);
      setRejectReason('');
      return;
    }
    doAction(item, approved);
  };

  const submitRejectExcuse = () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    doAction(rejectTarget, false, rejectReason.trim());
    setRejectTarget(null);
    setRejectReason('');
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل الطلبات…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر تحميل الطلبات" description="تحقق من اتصالك وحاول مجدداً" />;

  const RejectModal = (
    <Modal visible={!!rejectTarget} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
      <Pressable style={styles.modalOverlay} onPress={() => setRejectTarget(null)} />
      <View style={[styles.modalBox, { backgroundColor: c.surface }]}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 12 }}>سبب الرفض</Text>
        <TextInput
          value={rejectReason}
          onChangeText={setRejectReason}
          placeholder="اكتب سبب الرفض..."
          placeholderTextColor={c.textFaint}
          style={[styles.rejectInput, { borderColor: c.inputBorder, backgroundColor: c.inputBg, color: c.text }]}
          multiline
          autoFocus
          textAlign="right"
        />
        <View style={styles.modalActions}>
          <Pressable onPress={() => setRejectTarget(null)} style={[styles.modalBtn, { backgroundColor: c.surfaceAlt }]}>
            <Text style={{ color: c.textMuted, fontWeight: '600' }}>إلغاء</Text>
          </Pressable>
          <Pressable
            onPress={submitRejectExcuse}
            style={[styles.modalBtn, { backgroundColor: !rejectReason.trim() ? '#FECACA' : '#EF4444', opacity: !rejectReason.trim() ? 0.6 : 1 }]}
            disabled={!rejectReason.trim()}
          >
            <Text style={{ color: '#FFF', fontWeight: '700' }}>رفض</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  return (
    <GScreen>
      {RejectModal}
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
                <GText variant="caption" color={c.textFaint}>{formatDateAr(item.createdAt)}</GText>
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
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000060' },
  modalBox: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  rejectInput: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
});
