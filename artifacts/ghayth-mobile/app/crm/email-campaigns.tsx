/**
 * حملات البريد الإلكتروني
 * GET /api/crm/email-campaigns
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EmailCampaign {
  id: number;
  name?: string;
  subject?: string;
  recipientCount?: number;
  openRate?: number;
  clickRate?: number;
  sentAt?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function EmailCampaignsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<EmailCampaign[]>('/api/crm/email-campaigns');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الحملات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'حملات البريد الإلكتروني' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="mail-open-outline" title="لا توجد حملات بريدية" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/crm/email-campaign-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            {item.subject ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{item.subject}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 6 }}>
              {item.recipientCount != null ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.recipientCount} مستلم</Text> : null}
              {item.openRate != null ? <Text style={{ fontSize: 11, color: '#22C55E' }}>فتح: {item.openRate}%</Text> : null}
              {item.clickRate != null ? <Text style={{ fontSize: 11, color: c.brand }}>نقر: {item.clickRate}%</Text> : null}
              {item.sentAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.sentAt)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
