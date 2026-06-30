/**
 * الهيكل التنظيمي — المناصب والفِرَق واللجان
 * GET /api/org/positions
 * GET /api/org/teams
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

type Tab = 'positions' | 'teams' | 'committees';

interface Position {
  id: number;
  title?: string;
  level?: number;
  departmentName?: string;
  headcount?: number;
}

interface Team {
  id: number;
  name?: string;
  type?: string;
  leaderName?: string;
  memberCount?: number;
}

interface Committee {
  id: number;
  name?: string;
  type?: string;
  chairName?: string;
  memberCount?: number;
  status?: string;
}

export default function OrgChartScreen() {
  const c = useColors();
  const [tab, setTab] = useState<Tab>('positions');

  const { data: positions, isLoading: loadingPos } = useList<Position[]>('/api/org/positions');
  const { data: teams, isLoading: loadingTeams } = useList<Team[]>('/api/org/teams');
  const { data: committees, isLoading: loadingComm } = useList<Committee[]>('/api/org/committees');

  const posList = Array.isArray(positions) ? positions : [];
  const teamList = Array.isArray(teams) ? teams : [];
  const commList = Array.isArray(committees) ? committees : [];

  const isLoading = loadingPos || loadingTeams || loadingComm;

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'positions', label: 'المناصب', count: posList.length },
    { key: 'teams', label: 'الفِرَق', count: teamList.length },
    { key: 'committees', label: 'اللجان', count: commList.length },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الهيكل التنظيمي' }} />

      <View style={[styles.tabs, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted }}>
              {t.label} ({t.count})
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <GLoadingState text="جارٍ تحميل الهيكل…" />
      ) : tab === 'positions' ? (
        <FlatList
          data={posList}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40, flexGrow: 1 }}
          ListEmptyComponent={<GEmptyState icon="list-outline" title="لا توجد مناصب" description="لم تُضف مناصب إدارية بعد" />}
          renderItem={({ item }) => (
            <GCard style={{ gap: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.title ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                {item.departmentName ?? ''}{item.level ? ` · المستوى ${item.level}` : ''}
                {item.headcount ? ` · ${item.headcount} موظف` : ''}
              </Text>
            </GCard>
          )}
        />
      ) : tab === 'teams' ? (
        <FlatList
          data={teamList}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40, flexGrow: 1 }}
          ListEmptyComponent={<GEmptyState icon="people-outline" title="لا توجد فِرَق" description="لم تُضف فِرَق بعد" />}
          renderItem={({ item }) => (
            <GCard style={{ gap: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                {item.type ?? ''}{item.leaderName ? ` · القائد: ${item.leaderName}` : ''}
                {item.memberCount ? ` · ${item.memberCount} عضو` : ''}
              </Text>
            </GCard>
          )}
        />
      ) : (
        <FlatList
          data={commList}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40, flexGrow: 1 }}
          ListEmptyComponent={<GEmptyState icon="people-circle-outline" title="لا توجد لجان" description="لم تُضف لجان بعد" />}
          renderItem={({ item }) => (
            <GCard style={{ gap: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                {item.type ?? ''}{item.chairName ? ` · الرئيس: ${item.chairName}` : ''}
                {item.memberCount ? ` · ${item.memberCount} عضو` : ''}
              </Text>
            </GCard>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomColor: 'transparent', borderBottomWidth: 2 },
});
