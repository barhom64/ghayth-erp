import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RegItem { entityId?: number; entityName?: string; registrationExpiry?: string; daysLeft?: number; }

export default function GovExpiringRegistration() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RegItem[]>('/api/gov-integrations/expiring/registration');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تراخيص منتهية الصلاحية' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.entityId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="business-outline" title="لا توجد تراخيص منتهية" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.entityName ?? String(item.entityId ?? '')}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.daysLeft != null ? `${item.daysLeft} يوم` : item.registrationExpiry ?? ''}</Text>
          </View>
        )}
      />
    </View>
  );
}
