/**
 * مركز الترقيم
 * GET /api/numbering/schemes
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GCard } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface NumberingScheme {
  id: number;
  entity?: string;
  prefix?: string;
  suffix?: string;
  currentValue?: number;
  padLength?: number;
  format?: string;
  isLocked?: boolean;
  nextPreview?: string;
}

export default function NumberingScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<NumberingScheme[]>('/api/numbering/schemes');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الترقيم…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مركز الترقيم' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="keypad-outline" title="لا توجد مخططات ترقيم" description="" />}
        renderItem={({ item }) => (
          <GCard>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.entity ?? '—'}</Text>
              {item.isLocked ? (
                <View style={{ backgroundColor: '#EF444420', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, color: '#EF4444' }}>مقفل</Text>
                </View>
              ) : (
                <View style={{ backgroundColor: '#22C55E20', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, color: '#22C55E' }}>نشط</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 16 }}>
              {item.nextPreview || item.currentValue != null ? (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: c.brand }}>
                    {item.nextPreview ?? `${item.prefix ?? ''}${String(item.currentValue ?? 0).padStart(item.padLength ?? 4, '0')}${item.suffix ?? ''}`}
                  </Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>الرقم التالي</Text>
                </View>
              ) : null}
            </View>
            {item.format ? (
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 6, fontFamily: 'monospace' }}>
                {item.format}
              </Text>
            ) : null}
          </GCard>
        )}
      />
    </View>
  );
}
