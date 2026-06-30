/**
 * دليل الحسابات
 * GET /api/finance/gl/accounts
 */
import React, { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface GlAccount {
  id: number;
  code?: string;
  name?: string;
  type?: string;
  category?: string;
  parentCode?: string;
  isActive?: boolean;
  balance?: number;
  currency?: string;
}

const TYPE_COLOR: Record<string, string> = {
  asset: '#3B82F6',
  liability: '#EF4444',
  equity: '#8B5CF6',
  revenue: '#22C55E',
  expense: '#F59E0B',
};

export default function GlAccountsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<GlAccount[]>('/api/finance/gl/accounts');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل دليل الحسابات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'دليل الحسابات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="list-outline" title="لا توجد حسابات" description="" />}
        renderItem={({ item }) => {
          const typeColor = TYPE_COLOR[item.type ?? ''] ?? '#94A3B8';
          return (
            <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', gap: 10 }}>
              <View style={{ width: 4, backgroundColor: typeColor, borderRadius: 2, alignSelf: 'stretch' }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: typeColor }}>{item.code ?? '—'}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
                  {!item.isActive ? (
                    <View style={{ backgroundColor: '#94A3B820', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, color: '#94A3B8' }}>معطّل</Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
                  {item.type ? <Text style={{ fontSize: 11, color: typeColor }}>{item.type}</Text> : null}
                  {item.category ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.category}</Text> : null}
                  {item.balance != null ? (
                    <Text style={{ fontSize: 12, fontWeight: '700', color: item.balance >= 0 ? c.text : '#EF4444' }}>
                      {item.balance.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
