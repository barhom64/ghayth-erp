import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SaudiBank {
  code?: string;
  name?: string;
  swiftCode?: string;
  isWpsEnabled?: boolean;
}

export default function HrSaudiBanksScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SaudiBank[]>('/api/hr/saudi/banks');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل البنوك السعودية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'البنوك السعودية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.code ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="business-outline" title="لا توجد بنوك" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
              {item.code ? <Text style={{ fontSize: 12, color: c.brand, marginTop: 2 }}>{item.code}</Text> : null}
              {item.swiftCode ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.swiftCode}</Text> : null}
            </View>
            {item.isWpsEnabled ? (
              <Text style={{ fontSize: 10, color: '#22C55E', backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>WPS</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
