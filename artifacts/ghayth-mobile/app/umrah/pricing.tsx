/**
 * تسعيرة العمرة
 * GET /api/umrah/pricing
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GCard } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UmrahPricing {
  id: number;
  packageType?: string;
  season?: string;
  basePrice?: number;
  childPrice?: number;
  infantPrice?: number;
  currency?: string;
  validFrom?: string;
  validTo?: string;
  isActive?: boolean;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function UmrahPricingScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<UmrahPricing[]>('/api/umrah/pricing');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التسعيرة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تسعيرة العمرة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="pricetag-outline" title="لا توجد تسعيرة" description="" />}
        renderItem={({ item }) => (
          <GCard>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.packageType ?? '—'}</Text>
              {item.season ? <Text style={{ fontSize: 12, color: c.brand }}>{item.season}</Text> : null}
              {!item.isActive && (
                <View style={{ backgroundColor: '#EF444420', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, color: '#EF4444' }}>غير نشط</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 20 }}>
              {item.basePrice != null && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: c.brand }}>{item.basePrice}</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>بالغ</Text>
                </View>
              )}
              {item.childPrice != null && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{item.childPrice}</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>طفل</Text>
                </View>
              )}
              {item.infantPrice != null && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{item.infantPrice}</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>رضيع</Text>
                </View>
              )}
            </View>
            {(item.validFrom || item.validTo) && (
              <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 8 }}>
                {fmtDate(item.validFrom)} — {fmtDate(item.validTo)}
              </Text>
            )}
          </GCard>
        )}
      />
    </View>
  );
}
