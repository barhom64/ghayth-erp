/**
 * مكونات الراتب
 * GET /api/hr/salary-components
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SalaryComponent {
  id: number;
  name?: string;
  componentType?: string;
  calculationMethod?: string;
  amount?: number;
  percentage?: number;
  currency?: string;
  isTaxable?: boolean;
}

export default function SalaryComponentsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<SalaryComponent[]>('/api/hr/salary-components');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل مكونات الراتب…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مكونات الراتب' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="barcode-outline" title="لا توجد مكونات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/hr/salary-component-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.name ?? '—'}</Text>
                <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
                  {item.componentType ? <Text style={{ fontSize: 12, color: item.componentType === 'deduction' ? '#EF4444' : '#22C55E' }}>{item.componentType}</Text> : null}
                  {item.calculationMethod ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.calculationMethod}</Text> : null}
                </View>
              </View>
              <View style={{ alignItems: 'flex-start' }}>
                {item.amount != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
                {item.percentage != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.percentage}%</Text> : null}
                {item.isTaxable ? <Text style={{ fontSize: 10, color: c.textFaint }}>خاضع للضريبة</Text> : null}
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
