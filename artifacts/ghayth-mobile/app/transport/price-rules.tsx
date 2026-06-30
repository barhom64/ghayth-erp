/**
 * قواعد أسعار النقل
 * GET /api/transport/price-rules
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TransportPriceRule {
  id: number;
  name?: string;
  ruleType?: string;
  serviceType?: string;
  basePrice?: number;
  pricePerKm?: number;
  currency?: string;
  isActive?: boolean;
}

export default function TransportPriceRulesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<TransportPriceRule[]>('/api/transport/price-rules');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل قواعد الأسعار…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قواعد أسعار النقل' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="pricetag-outline" title="لا توجد قواعد أسعار" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#94A3B8' }} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.serviceType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.serviceType}</Text> : null}
              {item.ruleType ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.ruleType}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
              {item.basePrice != null ? <Text style={{ fontSize: 12, color: c.text }}>أساسي: {item.basePrice.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
              {item.pricePerKm != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>لكل كم: {item.pricePerKm}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
