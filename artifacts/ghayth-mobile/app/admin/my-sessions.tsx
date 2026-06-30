import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Session { id?: string; deviceType?: string; ip?: string; location?: string; current?: boolean; lastActive?: string; createdAt?: string; }

export default function MySessions() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Session[]>('/api/auth/sessions');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'جلسات الدخول' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="phone-portrait-outline" title="لا توجد جلسات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.deviceType ?? 'جهاز غير معروف'}</Text>
              {item.current && <Text style={{ color: '#22c55e', fontSize: 12 }}>الجلسة الحالية</Text>}
            </View>
            {!!item.ip && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>IP: {item.ip}</Text>}
            {!!item.location && <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.location}</Text>}
            {!!item.lastActive && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 4 }}>آخر نشاط: {new Date(item.lastActive).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
          </View>
        )}
      />
    </View>
  );
}
