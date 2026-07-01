import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EmailDomain { domain?: string; verified?: boolean; status?: string; }

export default function ProvisioningEmailDomains() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<EmailDomain[]>('/api/communications/provisioning/email-domains');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل النطاقات…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نطاقات البريد الإلكتروني' }} />
      <FlatList
        data={list} keyExtractor={(item, i) => item.domain ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="mail-outline" title="لا توجد نطاقات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.domain ?? '—'}</Text>
            <Text style={{ color: item.verified ? '#22c55e' : '#f59e0b', fontSize: 12 }}>{item.verified ? 'مُحقَّق' : item.status ?? 'معلّق'}</Text>
          </View>
        )}
      />
    </View>
  );
}
