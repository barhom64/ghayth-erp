/**
 * إدارة الأدوار والصلاحيات
 * GET /api/admin/roles
 * GET /api/admin/predefined-roles
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

type RoleTab = 'roles' | 'predefined';

interface Role {
  id: number;
  key?: string;
  name?: string;
  level?: number;
  description?: string;
  userCount?: number;
}

export default function AdminRolesScreen() {
  const c = useColors();
  const [tab, setTab] = useState<RoleTab>('roles');

  const { data: roles, isLoading: loadR, refetch: refetchR } = useList<Role[]>('/api/admin/roles');
  const { data: predefined, isLoading: loadP, refetch: refetchP } = useList<Role[]>('/api/admin/predefined-roles');

  const roleList = Array.isArray(roles) ? roles : [];
  const predefinedList = Array.isArray(predefined) ? predefined : [];
  const isLoading = tab === 'roles' ? loadR : loadP;
  const refetch = tab === 'roles' ? refetchR : refetchP;
  const items = tab === 'roles' ? roleList : predefinedList;

  const LEVEL_COLOR = (level?: number): string => {
    if (!level) return c.textMuted;
    if (level >= 90) return '#7C3AED';
    if (level >= 70) return '#EF4444';
    if (level >= 50) return '#F59E0B';
    if (level >= 30) return '#3B82F6';
    return '#22C55E';
  };

  const TABS: { key: RoleTab; label: string }[] = [
    { key: 'roles', label: 'الأدوار النشطة' },
    { key: 'predefined', label: 'الأدوار المُعرَّفة' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الأدوار والصلاحيات' }} />

      <View style={[styles.tabs, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <GLoadingState text="جارٍ التحميل…" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={<GEmptyState icon="shield-outline" title="لا توجد أدوار" description="" />}
          renderItem={({ item }) => {
            const color = LEVEL_COLOR(item.level);
            return (
              <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
                <View style={[styles.levelBadge, { backgroundColor: color + '20', borderColor: color }]}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color }}>{item.level ?? '—'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>
                    {item.name ?? item.key ?? '—'}
                  </Text>
                  {item.description ? (
                    <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}
                  {item.key ? (
                    <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 2 }}>{item.key}</Text>
                  ) : null}
                </View>
                {item.userCount != null ? (
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.userCount}</Text>
                ) : null}
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
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
  levelBadge: { width: 40, height: 40, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
