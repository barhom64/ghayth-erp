/**
 * قواعد التسعير
 * GET /api/finance/pricing/rules
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PricingRule {
  id: number;
  name?: string;
  ruleType?: string;
  priority?: number;
  discountPercent?: number;
  minimumQuantity?: number;
  isActive?: boolean;
}

export default function PricingRulesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<PricingRule[]>('/api/finance/pricing/rules');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل قواعد التسعير…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قواعد التسعير' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="pricetag-outline" title="لا توجد قواعد تسعير" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/finance/pricing-rule-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#94A3B8' }} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.ruleType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.ruleType}</Text> : null}
              {item.discountPercent != null ? <Text style={{ fontSize: 12, color: '#22C55E', fontWeight: '700' }}>خصم: {item.discountPercent}%</Text> : null}
              {item.priority != null ? <Text style={{ fontSize: 11, color: c.textFaint }}>أولوية: {item.priority}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
