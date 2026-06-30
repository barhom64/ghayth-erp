/**
 * المراسلات الرسمية — البريد الوارد والصادر
 * GET /api/correspondence
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

type Tab = 'incoming' | 'outgoing';

interface Correspondence {
  id: number;
  ref?: string;
  subject?: string;
  senderName?: string;
  receiverName?: string;
  type?: string;
  direction?: string;
  status?: string;
  sentAt?: string;
  receivedAt?: string;
  priority?: string;
}

const PRIORITY_COLOR: Record<string, string> = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#22C55E',
  urgent: '#7C3AED',
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function CorrespondenceScreen() {
  const c = useColors();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('incoming');

  const { data, isLoading, isError, refetch } = useList<Correspondence[]>('/api/correspondence', { direction: tab });
  const items = Array.isArray(data) ? data : [];

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'incoming', label: 'وارد', icon: 'mail-open-outline' },
    { key: 'outgoing', label: 'صادر', icon: 'paper-plane-outline' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'المراسلات الرسمية' }} />

      <View style={[styles.tabs, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}
          >
            <Ionicons name={t.icon as never} size={16} color={tab === t.key ? c.brand : c.textMuted} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted, marginRight: 4 }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <GLoadingState text="جارٍ تحميل المراسلات…" />
      ) : isError ? (
        <GEmptyState
          icon="alert-circle-outline"
          title="تعذّر التحميل"
          description="تحقق من الاتصال وأعد المحاولة"
          actionLabel="إعادة المحاولة"
          onAction={refetch}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <GEmptyState
              icon="mail-outline"
              title="لا توجد مراسلات"
              description={`لا توجد مراسلات ${tab === 'incoming' ? 'واردة' : 'صادرة'} حالياً`}
            />
          }
          renderItem={({ item }) => {
            const st = statusBadge(item.status ?? '');
            const priorityColor = PRIORITY_COLOR[item.priority ?? ''];
            return (
              <Pressable
                style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderBottomColor: c.border }]}
                onPress={() => undefined}
              >
                {priorityColor ? <View style={[styles.priorityBar, { backgroundColor: priorityColor }]} /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }} numberOfLines={1}>
                    {item.subject ?? '—'}
                  </Text>
                  <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                    {tab === 'incoming' ? item.senderName : item.receiverName ?? '—'} · {fmtDate(item.sentAt ?? item.receivedAt)}
                  </Text>
                  {item.ref ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 2 }}>{item.ref}</Text> : null}
                </View>
                {st ? <GStatusBadge status={st.label} size="sm" /> : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 8 },
  priorityBar: { width: 4, height: 40, borderRadius: 2 },
});
