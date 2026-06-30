/**
 * الخصومات
 * GET /api/hr/deductions
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Deduction {
  id: number;
  employeeName?: string;
  deductionType?: string;
  amount?: number;
  currency?: string;
  period?: string;
  status?: string;
  reason?: string;
}

export default function DeductionsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Deduction[]>('/api/hr/deductions');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الخصومات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الخصومات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="remove-circle-outline" title="لا توجد خصومات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.employeeName ?? '—'}</Text>
              {item.amount != null ? (
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#EF4444' }}>
                  -{item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.deductionType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.deductionType}</Text> : null}
              {item.period ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.period}</Text> : null}
              <GStatusBadge status={item.status ?? ''} />
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
