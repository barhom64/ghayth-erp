/**
 * عملاء CRM
 * GET /api/crm/clients
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CrmClient {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
  industry?: string;
  city?: string;
  opportunityCount?: number;
  contractCount?: number;
  status?: string;
}

export default function CrmClientsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<CrmClient[]>('/api/crm/clients');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل العملاء…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'عملاء CRM' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا يوجد عملاء" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/crm/client-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.industry ? <Text style={{ fontSize: 12, color: c.brand }}>{item.industry}</Text> : null}
              {item.city ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.city}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.opportunityCount != null ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.opportunityCount} فرصة</Text> : null}
              {item.contractCount != null ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.contractCount} عقد</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
