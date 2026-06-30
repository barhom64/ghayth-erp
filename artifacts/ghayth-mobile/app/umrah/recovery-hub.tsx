import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RecoveryItem {
  id?: number;
  issueType?: string;
  pilgrimName?: string;
  groupName?: string;
  status?: string;
  amount?: number;
  createdAt?: string;
}

export default function UmrahRecoveryHubScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RecoveryItem[]>('/api/umrah/reports/recovery-hub');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل مركز الاسترداد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مركز استرداد العمرة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="refresh-circle-outline" title="لا توجد بنود" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.pilgrimName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? 'pending'} />
            </View>
            {item.issueType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.issueType}</Text> : null}
            {item.groupName ? <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{item.groupName}</Text> : null}
            {item.amount != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444', marginTop: 2 }}>{item.amount.toLocaleString('ar-SA')} ر.س</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
