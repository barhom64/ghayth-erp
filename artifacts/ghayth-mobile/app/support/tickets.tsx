/**
 * تذاكر الدعم
 * GET /api/support/tickets
 */
import React, { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SupportTicket {
  id: number;
  ticketNumber?: string;
  title?: string;
  clientName?: string;
  priority?: string;
  category?: string;
  status?: string;
  assignedTo?: string;
  createdAt?: string;
  dueAt?: string;
  slaBreached?: boolean;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }); }
  catch { return val; }
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#DC2626',
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#22C55E',
};

export default function SupportTicketsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<SupportTicket[]>('/api/support/tickets');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التذاكر…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تذاكر الدعم' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="headset-outline" title="لا توجد تذاكر" description="" />}
        renderItem={({ item }) => {
          const pColor = PRIORITY_COLOR[item.priority ?? ''] ?? '#94A3B8';
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/support/ticket-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', gap: 10 }}
            >
              <View style={{ width: 4, backgroundColor: pColor, borderRadius: 2, alignSelf: 'stretch' }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
                  <GStatusBadge status={item.status ?? ''} />
                  {item.slaBreached ? (
                    <View style={{ backgroundColor: '#EF444420', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, color: '#EF4444' }}>SLA</Text>
                    </View>
                  ) : null}
                </View>
                {item.ticketNumber ? <Text style={{ fontSize: 11, color: c.brand, textAlign: 'right' }}>#{item.ticketNumber}</Text> : null}
                {item.clientName ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{item.clientName}</Text> : null}
                <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
                  {item.category ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.category}</Text> : null}
                  {item.assignedTo ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.assignedTo}</Text> : null}
                  {item.createdAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.createdAt)}</Text> : null}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
