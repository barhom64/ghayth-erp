import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Application { id?: number; applicantName?: string; jobTitle?: string; status?: string; appliedAt?: string; }

export default function RecruitmentApplications() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Application[]>('/api/recruitment/applications');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'طلبات التوظيف' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="person-add-outline" title="لا توجد طلبات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{item.applicantName ?? ''}</Text>
            {!!item.jobTitle && <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 2 }}>{item.jobTitle}</Text>}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {!!item.status && <Text style={{ color: c.brand, fontSize: 12 }}>{item.status}</Text>}
              {!!item.appliedAt && <Text style={{ color: c.textMuted, fontSize: 12 }}>{new Date(item.appliedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
            </View>
          </View>
        )}
      />
    </View>
  );
}
