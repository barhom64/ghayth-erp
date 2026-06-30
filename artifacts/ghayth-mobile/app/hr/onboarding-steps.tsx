import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OnboardingStep {
  id?: number;
  title?: string;
  description?: string;
  order?: number;
  isRequired?: boolean;
  status?: string;
}

export default function HrOnboardingStepsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<OnboardingStep[]>('/api/hr/onboarding-steps');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل خطوات التأهيل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'خطوات التأهيل' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="list-circle-outline" title="لا توجد خطوات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
            {item.order != null ? (
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{item.order}</Text>
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.title ?? '—'}</Text>
              {item.description ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.description}</Text> : null}
              {item.isRequired ? <Text style={{ fontSize: 10, color: '#EF4444', marginTop: 2 }}>إلزامية</Text> : null}
            </View>
            {item.status ? <GStatusBadge status={item.status} /> : null}
          </View>
        )}
      />
    </View>
  );
}
