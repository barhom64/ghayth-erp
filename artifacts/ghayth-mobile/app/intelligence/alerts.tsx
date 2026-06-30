import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Alert { id?: number; title?: string; severity?: string; type?: string; message?: string; createdAt?: string; }

export default function IntelligenceAlerts() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Alert[]>('/api/intelligence/alerts');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const severityColor = (s?: string) => s === 'critical' ? '#ef4444' : s === 'warning' ? '#f59e0b' : '#22c55e';
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تنبيهات الذكاء التشغيلي' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="notifications-outline" title="لا توجد تنبيهات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: severityColor(item.severity) }} />
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', flex: 1 }}>{item.title ?? ''}</Text>
            </View>
            {!!item.message && <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 4 }}>{item.message}</Text>}
            {!!item.createdAt && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 4 }}>{new Date(item.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
          </View>
        )}
      />
    </View>
  );
}
