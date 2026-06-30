/**
 * حملات التسويق
 * GET /api/marketing/campaigns
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Campaign {
  id: number;
  name?: string;
  type?: string;
  channel?: string;
  status?: string;
  budget?: number;
  spent?: number;
  revenue?: number;
  startDate?: string;
  endDate?: string;
  targetAudience?: string;
}

function fmtMoney(val?: number): string {
  if (!val) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ر.س';
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

const TYPE_LABEL: Record<string, string> = {
  digital: 'رقمي',
  print: 'مطبوع',
  outdoor: 'خارجي',
  social: 'تواصل اجتماعي',
  email: 'بريد إلكتروني',
  sms: 'رسائل نصية',
  event: 'فعالية',
};

const CHANNEL_ICON: Record<string, string> = {
  social: 'logo-instagram',
  email: 'mail-outline',
  sms: 'chatbubble-outline',
  digital: 'globe-outline',
  print: 'print-outline',
  outdoor: 'map-outline',
  event: 'calendar-outline',
};

export default function MarketingCampaignsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Campaign[]>('/api/marketing/campaigns');
  const campaigns = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الحملات…" />;
  if (isError) return (
    <GEmptyState
      icon="alert-circle-outline"
      title="تعذّر التحميل"
      description="تحقق من الاتصال وأعد المحاولة"
      actionLabel="إعادة المحاولة"
      onAction={refetch}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'حملات التسويق' }} />
      <FlatList
        data={campaigns}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <GEmptyState icon="megaphone-outline" title="لا توجد حملات" description="لا توجد حملات تسويقية مسجّلة بعد" />
        }
        renderItem={({ item }) => {
          const st = statusBadge(item.status ?? '');
          const icon = CHANNEL_ICON[item.channel ?? ''] ?? 'megaphone-outline';
          const roas = item.budget && item.budget > 0 ? ((item.revenue ?? 0) / item.budget).toFixed(2) : null;
          return (
            <Pressable
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderBottomColor: c.border }]}
              onPress={() => router.push({ pathname: '/marketing/campaign-detail' as never, params: { id: String(item.id) } })}
            >
              <View style={[styles.iconBox, { backgroundColor: c.brand + '20' }]}>
                <Ionicons name={icon as never} size={20} color={c.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }} numberOfLines={1}>
                  {item.name ?? '—'}
                </Text>
                <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                  {TYPE_LABEL[item.type ?? ''] ?? item.type ?? ''} · {fmtDate(item.startDate)}
                </Text>
                <View style={{ flexDirection: 'row-reverse', marginTop: 4, gap: 12 }}>
                  <Text style={{ fontSize: 11, color: c.textFaint }}>الميزانية: {fmtMoney(item.budget)}</Text>
                  {roas ? <Text style={{ fontSize: 11, color: '#22C55E' }}>ROAS: {roas}×</Text> : null}
                </View>
              </View>
              {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
  iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
