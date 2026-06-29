/**
 * الإشعارات — مقروء / غير مقروء
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GScreen, GText, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, useMutation } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';

type Tab = 'unread' | 'read';

interface NotificationItem {
  id: number;
  title: string;
  body?: string;
  createdAt: string;
  read: boolean;
  icon?: string;
}

export default function NotificationsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('unread');

  const { data, isLoading, refetch } = useList<NotificationItem[]>('/api/notifications');
  const markAllMutation = useMutation<unknown, object>('/api/notifications/mark-all-read', 'PATCH');

  const unread = (data ?? []).filter(n => !n.read);
  const read = (data ?? []).filter(n => n.read);
  const items = tab === 'unread' ? unread : read;

  const handleMarkAll = async () => {
    await markAllMutation.mutateAsync({});
    qc.invalidateQueries({ queryKey: ['/api/notifications'] });
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل الإشعارات…" />;

  return (
    <GScreen>
      {/* الترويسة */}
      <View style={[styles.header, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        <View style={styles.titleRow}>
          {unread.length > 0 ? (
            <Pressable onPress={handleMarkAll}>
              <Text style={{ fontSize: 13, color: c.brand, fontWeight: '600' }}>تحديد الكل كمقروء</Text>
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
        contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <GEmptyState icon="notifications-off-outline" title="لا توجد إشعارات" />
        }
        renderItem={({ item }) => (
          <View style={[styles.notifRow, { backgroundColor: item.read ? c.bg : c.surface, borderBottomColor: c.border }]}>
            {!item.read && <View style={[styles.unreadDot, { backgroundColor: c.brand }]} />}
            <View style={styles.notifBody}>
              <Text style={[styles.notifTitle, { color: c.text }]}>{item.title}</Text>
              {item.body ? <Text style={[styles.notifBody2, { color: c.textMuted }]}>{item.body}</Text> : null}
              <Text style={[styles.notifTime, { color: c.textFaint }]}>{item.createdAt}</Text>
            </View>
            <View style={[styles.notifIcon, { backgroundColor: c.surfaceAlt }]}>
              <Ionicons name={(item.icon as never) ?? 'notifications-outline'} size={20} color={c.brand} />
            </View>
          </View>
        )}
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
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, marginLeft: 8 },
  notifBody: { flex: 1, marginRight: 12 },
  notifBody2: { fontSize: 13, marginTop: 2, lineHeight: 18, textAlign: 'right' },
  notifTitle: { fontSize: 14, fontWeight: '600', textAlign: 'right' },
  notifTime: { fontSize: 11, marginTop: 4, textAlign: 'right' },
  notifIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
