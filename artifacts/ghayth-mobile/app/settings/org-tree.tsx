import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OrgNode {
  id?: number;
  name?: string;
  type?: string;
  level?: number;
  parentName?: string;
  childCount?: number;
}

export default function SettingsOrgTreeScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<OrgNode[]>('/api/settings/org-tree');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الهيكل التنظيمي…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الهيكل التنظيمي' }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}>
        {list.length === 0 ? (
          <GEmptyState icon="git-network-outline" title="لا يوجد هيكل تنظيمي" description="" />
        ) : list.map((node, i) => (
          <View
            key={node.id ?? i}
            style={{
              backgroundColor: c.surface,
              borderBottomWidth: 1,
              borderBottomColor: c.border,
              padding: 14,
              paddingStart: 14 + (node.level ?? 0) * 16,
              flexDirection: 'row-reverse',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: node.level === 0 ? '700' : '400', color: c.text }}>{node.name ?? '—'}</Text>
              {node.parentName ? <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{node.parentName}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              {node.type ? <Text style={{ fontSize: 11, color: c.brand }}>{node.type}</Text> : null}
              {node.childCount != null && node.childCount > 0 ? (
                <Text style={{ fontSize: 10, color: c.textFaint }}>{node.childCount} فرع</Text>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
