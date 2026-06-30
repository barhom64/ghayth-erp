/**
 * السياسات
 * GET /api/governance/policies
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Policy {
  id: number;
  title?: string;
  category?: string;
  version?: string;
  effectiveDate?: string;
  reviewDate?: string;
  owner?: string;
  status?: string;
  isRequired?: boolean;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function GovernancePoliciesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Policy[]>('/api/governance/policies');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل السياسات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'السياسات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد سياسات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/governance/policy-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
              {item.isRequired ? (
                <View style={{ backgroundColor: '#EF444420', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontSize: 10, color: '#EF4444' }}>إلزامي</Text>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 4 }}>
              {item.category ? <Text style={{ fontSize: 12, color: c.brand }}>{item.category}</Text> : null}
              {item.version ? <Text style={{ fontSize: 12, color: c.textMuted }}>v{item.version}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.owner ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.owner}</Text> : null}
              {item.effectiveDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.effectiveDate)}</Text> : null}
              {item.reviewDate ? <Text style={{ fontSize: 11, color: '#F59E0B' }}>مراجعة: {fmtDate(item.reviewDate)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
