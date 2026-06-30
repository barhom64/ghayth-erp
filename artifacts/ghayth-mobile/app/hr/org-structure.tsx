/**
 * الهيكل التنظيمي
 * GET /api/org/legal-entities
 * GET /api/org/positions
 * GET /api/org/teams
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GCard } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

type OrgTab = 'entities' | 'positions' | 'teams';

interface LegalEntity { id: number; name?: string; type?: string; crNumber?: string; isActive?: boolean }
interface Position { id: number; title?: string; department?: string; level?: string; headcount?: number }
interface Team { id: number; name?: string; leadName?: string; memberCount?: number; type?: string }

export default function OrgStructureScreen() {
  const c = useColors();
  const [tab, setTab] = useState<OrgTab>('entities');

  const { data: entities, isLoading: loadE, refetch: refE } = useList<LegalEntity[]>('/api/org/legal-entities');
  const { data: positions, isLoading: loadP, refetch: refP } = useList<Position[]>('/api/org/positions');
  const { data: teams, isLoading: loadT, refetch: refT } = useList<Team[]>('/api/org/teams');

  const entityList = Array.isArray(entities) ? entities : [];
  const positionList = Array.isArray(positions) ? positions : [];
  const teamList = Array.isArray(teams) ? teams : [];

  const TABS: { key: OrgTab; label: string; icon: string }[] = [
    { key: 'entities', label: 'الكيانات', icon: 'business-outline' },
    { key: 'positions', label: 'المناصب', icon: 'briefcase-outline' },
    { key: 'teams', label: 'الفرق', icon: 'people-outline' },
  ];

  const isLoading = tab === 'entities' ? loadE : tab === 'positions' ? loadP : loadT;
  const refetch = tab === 'entities' ? refE : tab === 'positions' ? refP : refT;
  const data = tab === 'entities' ? entityList : tab === 'positions' ? positionList : teamList;

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
            <Ionicons name={t.icon as never} size={14} color={tab === t.key ? c.brand : c.textMuted} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted, marginRight: 4 }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {isLoading ? (
        <GLoadingState text="جارٍ التحميل…" />
      ) : (
        <FlatList
          data={data as object[]}
          keyExtractor={item => String((item as { id: number }).id)}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40, flexGrow: 1 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={<GEmptyState icon="alert-circle-outline" title="لا توجد بيانات" description="" />}
          renderItem={({ item }) => {
            if (tab === 'entities') {
              const e = item as LegalEntity;
              return (
                <GCard>
                  <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{e.name ?? '—'}</Text>
                    {e.type ? <Text style={{ fontSize: 11, color: c.brand }}>{e.type}</Text> : null}
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: e.isActive ? '#22C55E' : '#94A3B8' }} />
                  </View>
                  {e.crNumber ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 4 }}>س.ت: {e.crNumber}</Text> : null}
                </GCard>
              );
            }
            if (tab === 'positions') {
              const p = item as Position;
              return (
                <GCard>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>{p.title ?? '—'}</Text>
                  <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 6 }}>
                    {p.department ? <Text style={{ fontSize: 12, color: c.textMuted }}>{p.department}</Text> : null}
                    {p.level ? <Text style={{ fontSize: 12, color: c.brand }}>{p.level}</Text> : null}
                    {p.headcount != null ? <Text style={{ fontSize: 12, color: c.text }}>{p.headcount} شاغر</Text> : null}
                  </View>
                </GCard>
              );
            }
            const t = item as Team;
            return (
              <GCard>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>{t.name ?? '—'}</Text>
                <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 6 }}>
                  {t.leadName ? <Text style={{ fontSize: 12, color: c.textMuted }}>القائد: {t.leadName}</Text> : null}
                  {t.memberCount != null ? <Text style={{ fontSize: 12, color: c.text }}>{t.memberCount} عضو</Text> : null}
                </View>
              </GCard>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', paddingVertical: 11, gap: 4, borderBottomColor: 'transparent', borderBottomWidth: 2 },
});
