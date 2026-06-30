/**
 * المناصب الوظيفية
 * GET /api/hr/positions
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface HrPosition {
  id: number;
  title?: string;
  departmentName?: string;
  grade?: string;
  minSalary?: number;
  maxSalary?: number;
  currency?: string;
  headcount?: number;
  filledCount?: number;
}

export default function HrPositionsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<HrPosition[]>('/api/hr/positions');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المناصب…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'المناصب الوظيفية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="briefcase-outline" title="لا توجد مناصب" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/hr/position-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
              {item.grade ? <Text style={{ fontSize: 12, color: c.brand, fontWeight: '700' }}>{item.grade}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.departmentName ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.departmentName}</Text> : null}
              {item.headcount != null ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.filledCount ?? 0}/{item.headcount} موظف</Text> : null}
            </View>
            {item.minSalary != null && item.maxSalary != null ? (
              <Text style={{ fontSize: 12, color: c.brand, textAlign: 'right', marginTop: 2 }}>
                {item.minSalary.toLocaleString('ar-SA')} — {item.maxSalary.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}
