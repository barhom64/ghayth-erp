/**
 * لوحة فريق العمل — خلاصة الأنشطة والفريق
 * GET /api/workspace/feed
 * GET /api/workspace/team
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GCard } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

type WorkTab = 'feed' | 'team';

interface FeedItem {
  id: number;
  action?: string;
  entity?: string;
  actorName?: string;
  description?: string;
  createdAt?: string;
}

interface TeamMember {
  id: number;
  name?: string;
  role?: string;
  status?: string;
  email?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

const STATUS_COLOR: Record<string, string> = {
  active: '#22C55E',
  online: '#22C55E',
  offline: '#94A3B8',
  busy: '#F59E0B',
};

export default function WorkspaceScreen() {
  const c = useColors();
  const [tab, setTab] = useState<WorkTab>('feed');

  const { data: feed, isLoading: loadF, refetch: refetchF } = useList<FeedItem[]>('/api/workspace/feed');
  const { data: team, isLoading: loadT, refetch: refetchT } = useList<TeamMember[]>('/api/workspace/team');

  const feedList = Array.isArray(feed) ? feed : [];
  const teamList = Array.isArray(team) ? team : [];
  const isLoading = tab === 'feed' ? loadF : loadT;
  const refetch = tab === 'feed' ? refetchF : refetchT;

  const TABS: { key: WorkTab; label: string; icon: string }[] = [
    { key: 'feed', label: 'خلاصة الأنشطة', icon: 'pulse-outline' },
    { key: 'team', label: 'الفريق', icon: 'people-outline' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'بيئة العمل' }} />

      <View style={[styles.tabs, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}
          >
            <Ionicons name={t.icon as never} size={15} color={tab === t.key ? c.brand : c.textMuted} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted, marginRight: 4 }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <GLoadingState text="جارٍ التحميل…" />
      ) : tab === 'feed' ? (
        <FlatList
          data={feedList}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={<GEmptyState icon="pulse-outline" title="لا توجد أنشطة" description="لا توجد أنشطة فريق حالياً" />}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right' }}>
                  {item.actorName ?? '—'} — {item.action ?? ''}
                </Text>
                {item.description ? (
                  <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 2 }}>
                  {fmtDate(item.createdAt)}
                </Text>
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={teamList}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={<GEmptyState icon="people-outline" title="لا يوجد أعضاء" description="" />}
          renderItem={({ item }) => {
            const statusColor = STATUS_COLOR[item.status?.toLowerCase() ?? ''] ?? '#94A3B8';
            return (
              <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
                <View style={[styles.avatar, { backgroundColor: c.brand + '30' }]}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: c.brand }}>
                    {(item.name ?? '?')[0]}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.name ?? '—'}</Text>
                  <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                    {item.role ?? '—'} · {item.email ?? ''}
                  </Text>
                </View>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: statusColor }} />
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 5, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
