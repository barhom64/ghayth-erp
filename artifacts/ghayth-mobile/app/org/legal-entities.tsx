import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LegalEntity {
  id?: number;
  name?: string;
  registrationNumber?: string;
  type?: string;
  country?: string;
}

export default function OrgLegalEntitiesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<LegalEntity[]>('/api/org/legal-entities');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الكيانات القانونية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الكيانات القانونية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="business-outline" title="لا توجد كيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
            {item.registrationNumber ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>رقم السجل: {item.registrationNumber}</Text> : null}
            {item.type ? <Text style={{ fontSize: 12, color: c.brand, marginTop: 2 }}>{item.type}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
