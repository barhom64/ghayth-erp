/**
 * إدارة الفروع
 * GET /api/settings/companies
 * GET /api/settings/branches (or /api/branches)
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GCard } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Branch {
  id: number;
  name?: string;
  code?: string;
  companyName?: string;
  city?: string;
  region?: string;
  phone?: string;
  isActive?: boolean;
  employeeCount?: number;
}

export default function BranchesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Branch[]>('/api/branches');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الفروع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الفروع' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="business-outline" title="لا توجد فروع" description="" />}
        renderItem={({ item }) => (
          <GCard>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#94A3B8' }} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              {item.code ? <Text style={{ fontSize: 11, color: c.brand }}>{item.code}</Text> : null}
            </View>
            {item.companyName ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{item.companyName}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 6 }}>
              {item.city ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.city}</Text> : null}
              {item.region ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.region}</Text> : null}
              {item.employeeCount != null ? (
                <Text style={{ fontSize: 12, color: c.text }}>{item.employeeCount} موظف</Text>
              ) : null}
            </View>
          </GCard>
        )}
      />
    </View>
  );
}
