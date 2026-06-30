/**
 * المصروفات
 * GET /api/finance/expenses
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Expense {
  id: number;
  title?: string;
  category?: string;
  amount?: number;
  currency?: string;
  expenseDate?: string;
  submittedBy?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function ExpensesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Expense[]>('/api/finance/expenses');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المصروفات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'المصروفات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="barcode-outline" title="لا توجد مصروفات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/finance/expense-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.title ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            {item.category ? (
              <Text style={{ fontSize: 12, color: c.brand, textAlign: 'right', marginBottom: 4 }}>{item.category}</Text>
            ) : null}
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11, color: c.textMuted }}>{fmtDate(item.expenseDate)}</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>
                {(item.amount ?? 0).toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
