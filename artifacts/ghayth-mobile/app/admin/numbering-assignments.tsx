import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface NumberingAssignment {
  id?: number;
  entityType?: string;
  schemeCode?: string;
  branchName?: string;
  companyName?: string;
}

export default function AdminNumberingAssignmentsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<NumberingAssignment[]>('/api/numbering/assignments');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تعيينات الترقيم…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تعيينات الترقيم' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="keypad-outline" title="لا توجد تعيينات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.entityType ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: c.brand }}>{item.schemeCode ?? '—'}</Text>
            </View>
            {(item.branchName || item.companyName) ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>
                {[item.companyName, item.branchName].filter(Boolean).join(' / ')}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
