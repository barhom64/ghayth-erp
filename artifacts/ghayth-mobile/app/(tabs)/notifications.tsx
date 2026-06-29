/**
 * الإشعارات — مقروء / غير مقروء
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GScreen, GText, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { apiFetch, useList, useMutation } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
import { setRecord } from '@/lib/recordStore';

type Tab = 'unread' | 'read';

interface NotificationItem {
  id: number;
  title: string;
  body?: string;
  type?: string;
  priority?: string;
  isRead: boolean;
  createdAt: string;
  refType?: string;
  refId?: number;
  actionUrl?: string;
}

interface NotifResponse {
  data?: NotificationItem[];
  total?: number;
}

function formatTime(val: string): string {
  try {
    const d = new Date(val);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'الآن';
    if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `منذ ${diffH} ساعة`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `منذ ${diffD} يوم`;
    return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return val;
  }
}

const TYPE_ICON: Record<string, string> = {
  leave: 'calendar-outline',
  loan: 'cash-outline',
  payroll: 'card-outline',
  maintenance: 'construct-outline',
  invoice: 'receipt-outline',
  task: 'checkbox-outline',
  alert: 'alert-circle-outline',
  approval: 'checkmark-done-circle-outline',
  system: 'settings-outline',
};

// refType → { module, section } للتنقل لصفحة السجل
const REF_NAV: Record<string, { module: string; section: string }> = {
  leave: { module: 'hr', section: 'leave-requests' },
  loan: { module: 'hr', section: 'loans' },
  overtime: { module: 'hr', section: 'overtime' },
  payroll: { module: 'hr', section: 'payroll' },
  invoice: { module: 'finance', section: 'invoices' },
  purchase_order: { module: 'finance', section: 'purchase-orders' },
  task: { module: 'projects', section: 'tasks' },
  maintenance: { module: 'fleet', section: 'maintenance' },
  ticket: { module: 'support', section: 'tickets' },
};

export default function NotificationsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('unread');
  const [markingId, setMarkingId] = useState<number | null>(null);

  const { data: raw, isLoading, refetch } = useList<NotifResponse>('/api/notifications', { pageSize: 50 });
  const markAllMutation = useMutation<unknown, object>('/api/notifications/mark-all-read', 'PATCH');

  const all: NotificationItem[] = raw?.data ?? [];
  const unread = all.filter(n => !n.isRead);
  const read = all.filter(n => n.isRead);
  const items = tab === 'unread' ? unread : read;

  const handleTap = async (item: NotificationItem) => {
    if (!item.isRead && markingId !== item.id) {
      setMarkingId(item.id);
      try {
        await apiFetch(`/api/notifications/${item.id}/read`, { method: 'PATCH' });
        await qc.invalidateQueries({ queryKey: ['/api/notifications'] });
      } catch { /* silent */ }
      finally { setMarkingId(null); }
    }
    // التنقل للسجل المرتبط
    const nav = item.refType ? REF_NAV[item.refType] : null;
    if (nav && item.refId) {
      setRecord({ title: item.title, row: { id: item.refId }, module: nav.module, section: nav.section });
      router.push('/record');
    }
  };

  const handleMarkOne = async (id: number) => {
    setMarkingId(id);
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      await qc.invalidateQueries({ queryKey: ['/api/notifications'] });
    } catch { /* silent */ }
    finally { setMarkingId(null); }
  };

  const handleMarkAll = async () => {
    await markAllMutation.mutateAsync({});
    await qc.invalidateQueries({ queryKey: ['/api/notifications'] });
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل الإشعارات…" />;

  return (
    <GScreen>
      {/* الترويسة */}
      <View style={[styles.header, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        <View style={styles.titleRow}>
          {unread.length > 0 ? (
            <Pressable onPress={handleMarkAll} disabled={markAllMutation.isPending}>
              <Text style={{ fontSize: 13, color: c.brand, fontWeight: '600', opacity: markAllMutation.isPending ? 0.5 : 1 }}>
                تحديد الكل كمقروء
              </Text>
            </Pressable>
          ) : <View />}
          <GText variant="heading">الإشعارات</GText>
        </View>
        {/* تبويبات */}
        <View style={styles.tabs}>
          {(['unread', 'read'] as Tab[]).map(t => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tabBtn, tab === t && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: tab === t ? c.brand : c.textMuted }}>
                {t === 'unread' ? `غير مقروء (${unread.length})` : `مقروء (${read.length})`}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <GEmptyState icon="notifications-off-outline" title="لا توجد إشعارات" description={tab === 'unread' ? 'ليس لديك إشعارات جديدة' : 'لا توجد إشعارات مقروءة'} />
        }
        renderItem={({ item }) => {
          const icon = TYPE_ICON[item.type ?? ''] ?? 'notifications-outline';
          const busy = markingId === item.id;
          return (
            <Pressable
              onPress={() => !busy && handleTap(item)}
              style={[styles.notifRow, { backgroundColor: item.isRead ? c.bg : c.surface, borderBottomColor: c.border, opacity: busy ? 0.6 : 1 }]}
            >
              {!item.isRead && <View style={[styles.unreadDot, { backgroundColor: c.brand }]} />}
              <View style={styles.notifContent}>
                <Text style={[styles.notifTitle, { color: c.text }]}>{item.title}</Text>
                {item.body ? <Text style={[styles.notifBodyText, { color: c.textMuted }]} numberOfLines={2}>{item.body}</Text> : null}
                <Text style={[styles.notifTime, { color: c.textFaint }]}>{formatTime(item.createdAt)}</Text>
              </View>
              <View style={[styles.notifIcon, { backgroundColor: item.isRead ? c.surfaceAlt : c.primary + '18' }]}>
                <Ionicons name={icon as never} size={20} color={c.brand} />
              </View>
            </Pressable>
          );
        }}
      />
    </GScreen>
  );
}

const styles = StyleSheet.create({
  header: { borderBottomWidth: 1, paddingTop: 16 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 },
  tabs: { flexDirection: 'row' },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  notifRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, marginLeft: 10, flexShrink: 0 },
  notifContent: { flex: 1, marginRight: 12 },
  notifBodyText: { fontSize: 13, marginTop: 2, lineHeight: 18, textAlign: 'right' },
  notifTitle: { fontSize: 14, fontWeight: '600', textAlign: 'right' },
  notifTime: { fontSize: 11, marginTop: 4, textAlign: 'right' },
  notifIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
