import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface GlPendingItem {
  id?: number;
  type?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  period?: string;
  reason?: string;
}

export default function GlPendingScreen() {
  const c = useColors();
  const mudad = useList<GlPendingItem[]>('/api/gl-helpers/mudad-salary/pending');
  const fx = useList<GlPendingItem[]>('/api/gl-helpers/fx-revaluation/pending');

  const isLoading = mudad.isLoading && fx.isLoading;
  const mudadList = Array.isArray(mudad.data) ? mudad.data : [];
  const fxList = Array.isArray(fx.data) ? fx.data : [];
  const list = [...mudadList.map(i => ({ ...i, type: 'مدد رواتب' })), ...fxList.map(i => ({ ...i, type: 'إعادة تقييم FX' }))];

  if (isLoading) return <GLoadingState text="جارٍ تحميل القيود المعلّقة…" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قيود GL المعلّقة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => `${item.type}-${item.id}-${i}`}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={() => { mudad.refetch(); fx.refetch(); }}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-done-outline" title="لا توجد قيود معلّقة" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>{item.type}</Text>
              {item.reference ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.reference}</Text> : null}
              {item.period ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.period}</Text> : null}
            </View>
            {item.amount != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: '#F59E0B', textAlign: 'right' }}>{item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
            {item.reason ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right' }}>{item.reason}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
