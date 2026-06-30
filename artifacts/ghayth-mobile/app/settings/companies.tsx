/**
 * إدارة الشركات
 * GET /api/settings/companies
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GCard } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Company {
  id: number;
  name?: string;
  nameEn?: string;
  crNumber?: string;
  vatNumber?: string;
  city?: string;
  phone?: string;
  email?: string;
  isActive?: boolean;
  branchCount?: number;
  employeeCount?: number;
}

export default function CompaniesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Company[]>('/api/settings/companies');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الشركات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الشركات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="business-outline" title="لا توجد شركات" description="" />}
        renderItem={({ item }) => (
          <GCard>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#94A3B8' }} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
            </View>
            {item.nameEn ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{item.nameEn}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 6 }}>
              {item.crNumber ? <Text style={{ fontSize: 12, color: c.textFaint }}>س.ت: {item.crNumber}</Text> : null}
              {item.vatNumber ? <Text style={{ fontSize: 12, color: c.textFaint }}>ض.ق.م: {item.vatNumber}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 6 }}>
              {item.city ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.city}</Text> : null}
              {item.branchCount != null ? <Text style={{ fontSize: 12, color: c.text }}>{item.branchCount} فرع</Text> : null}
              {item.employeeCount != null ? <Text style={{ fontSize: 12, color: c.text }}>{item.employeeCount} موظف</Text> : null}
            </View>
          </GCard>
        )}
      />
    </View>
  );
}
