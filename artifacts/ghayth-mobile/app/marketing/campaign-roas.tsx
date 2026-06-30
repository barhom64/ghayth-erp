import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RoasData { campaignId?: number; spend?: number; revenue?: number; roas?: number; conversions?: number; }

export default function CampaignRoasScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RoasData>('/api/marketing/campaigns/0/roas');
  const d = (data && !Array.isArray(data)) ? data as RoasData : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  if (!d) return <GEmptyState icon="trending-up-outline" title="لا توجد بيانات" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'عائد الإنفاق الإعلاني' }} />
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>الإنفاق</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>
            {d.spend != null ? d.spend.toLocaleString('ar-SA') + ' ر.س' : '—'}
          </Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>الإيراد</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>
            {d.revenue != null ? d.revenue.toLocaleString('ar-SA') + ' ر.س' : '—'}
          </Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>ROAS</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.roas ?? '—'}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>التحويلات</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.conversions ?? '—'}</Text>
        </View>
      </View>
    </ScrollView>
  );
}
