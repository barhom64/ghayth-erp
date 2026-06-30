/**
 * نشاطات CRM
 * GET /api/crm/activities
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CrmActivity {
  id: number;
  type?: string;
  subject?: string;
  clientName?: string;
  opportunityTitle?: string;
  assignedTo?: string;
  scheduledAt?: string;
  completedAt?: string;
  outcome?: string;
  status?: string;
  notes?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

const TYPE_ICON: Record<string, string> = {
  call: 'call-outline',
  email: 'mail-outline',
  meeting: 'people-outline',
  demo: 'desktop-outline',
  follow_up: 'refresh-outline',
  note: 'document-text-outline',
};

export default function CrmActivitiesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CrmActivity[]>('/api/crm/activities');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل النشاطات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نشاطات CRM' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="pulse-outline" title="لا توجد نشاطات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.brand + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={(TYPE_ICON[item.type ?? ''] ?? 'pulse-outline') as never} size={18} color={c.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.subject ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              {item.clientName ? <Text style={{ fontSize: 12, color: c.brand, textAlign: 'right' }}>{item.clientName}</Text> : null}
              {item.assignedTo ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{item.assignedTo}</Text> : null}
              {item.outcome ? <Text style={{ fontSize: 12, color: '#22C55E', textAlign: 'right', marginTop: 2 }}>النتيجة: {item.outcome}</Text> : null}
              <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 4 }}>
                {item.scheduledAt ? fmtDate(item.scheduledAt) : fmtDate(item.completedAt)}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
