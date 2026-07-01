import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RealizedFx { id?: number; currency?: string; amount?: number; gainLoss?: number; period?: string; }

export default function GlRealizedFxScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RealizedFx[]>('/api/finance/gl-helpers/realized-fx/history');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تاريخ فروق العملة المحقّقة' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cash-outline" title="لا يوجد تاريخ" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ color: c.text, fontSize: 14 }}>{item.currency ?? ''}</Text>
              {!!item.period && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.period}</Text>}
            </View>
            {item.gainLoss != null && <Text style={{ color: item.gainLoss >= 0 ? c.brand : '#ef4444', fontSize: 14, fontWeight: '600' }}>{item.gainLoss.toLocaleString('ar-SA')}</Text>}
          </View>
        )}
      />
    </View>
  );
}
