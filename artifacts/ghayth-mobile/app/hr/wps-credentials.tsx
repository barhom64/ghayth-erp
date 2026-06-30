import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface WpsCredential {
  id?: number;
  bankCode?: string;
  bankName?: string;
  entityId?: string;
  isActive?: boolean;
  createdAt?: string;
}

export default function HrWpsCredentialsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<WpsCredential[]>('/api/hr/saudi/wps/credentials');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات WPS…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'بيانات اعتماد WPS' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="key-outline" title="لا توجد بيانات اعتماد" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.bankName ?? item.bankCode ?? '—'}</Text>
              {item.bankCode ? <Text style={{ fontSize: 12, color: c.brand, marginTop: 2 }}>{item.bankCode}</Text> : null}
              {item.entityId ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.entityId}</Text> : null}
            </View>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#9CA3AF' }} />
          </View>
        )}
      />
    </View>
  );
}
