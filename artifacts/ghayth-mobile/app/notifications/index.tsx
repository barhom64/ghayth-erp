/**
 * الإشعارات
 * GET /api/notifications
 */
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';

interface Notification {
  id: number;
  title?: string;
  body?: string;
  type?: string;
  isRead?: boolean;
  createdAt?: string;
  link?: string;
}

const TYPE_ICON: Record<string, string> = {
  alert: 'alert-circle-outline',
  info: 'information-circle-outline',
  success: 'checkmark-circle-outline',
  warning: 'warning-outline',
  reminder: 'alarm-outline',
};

function fmtDate(val?: string): string {
  if (!val) return '';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

export default function NotificationsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useList<Notification[]>('/api/notifications');
  const list = Array.isArray(data) ? data : [];

  async function markRead(id: number) {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
    qc.invalidateQueries({ queryKey: ['/api/notifications'] });
  }

  async function markAllRead() {
    await apiFetch('/api/notifications/mark-all-read', { method: 'PATCH' });
    qc.invalidateQueries({ queryKey: ['/api/notifications'] });
  }

  if (isLoading) return <GLoadingState text="جارٍ تحميل الإشعارات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const unreadCount = list.filter(n => !n.isRead).length;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الإشعارات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListHeaderComponent={unreadCount > 0 ? (
          <Pressable onPress={markAllRead} style={{ padding: 14, alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 13, color: c.brand, fontWeight: '600' }}>تحديد الكل كمقروء</Text>
          </Pressable>
        ) : null}
        ListEmptyComponent={<GEmptyState icon="notifications-outline" title="لا توجد إشعارات" description="لا توجد إشعارات جديدة" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => !item.isRead && markRead(item.id)}
            style={[styles.row, {
              backgroundColor: item.isRead ? c.surface : c.brand + '10',
              borderBottomColor: c.border,
            }]}
          >
            <View style={[styles.icon, { backgroundColor: item.isRead ? c.bg : c.brand + '20' }]}>
              <Ionicons
                name={(TYPE_ICON[item.type ?? ''] ?? 'notifications-outline') as never}
                size={20}
                color={item.isRead ? c.textMuted : c.brand}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: item.isRead ? '500' : '700', color: c.text, textAlign: 'right' }}>
                {item.title ?? '—'}
              </Text>
              {item.body ? (
                <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }} numberOfLines={2}>
                  {item.body}
                </Text>
              ) : null}
              <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 4 }}>
                {fmtDate(item.createdAt)}
              </Text>
            </View>
            {!item.isRead && (
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.brand }} />
            )}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, borderBottomWidth: 1, gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
});
