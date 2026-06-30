/**
 * خط المبيعات — CRM Pipeline
 * GET /api/crm/opportunities
 */
import React, { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Opportunity {
  id: number;
  title?: string;
  clientName?: string;
  stage?: string;
  value?: number;
  currency?: string;
  probability?: number;
  expectedClose?: string;
  assignedTo?: string;
  source?: string;
}

const STAGE_ORDER = ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
const STAGE_LABEL: Record<string, string> = {
  prospecting: 'استكشاف',
  qualification: 'تأهيل',
  proposal: 'عرض',
  negotiation: 'تفاوض',
  closed_won: 'رُبح',
  closed_lost: 'خُسر',
};
const STAGE_COLOR: Record<string, string> = {
  prospecting: '#94A3B8',
  qualification: '#3B82F6',
  proposal: '#F59E0B',
  negotiation: '#F97316',
  closed_won: '#22C55E',
  closed_lost: '#EF4444',
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function CrmPipelineScreen() {
  const c = useColors();
  const router = useRouter();
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useList<Opportunity[]>('/api/crm/opportunities');
  const all = Array.isArray(data) ? data : [];
  const list = activeStage ? all.filter(o => o.stage === activeStage) : all;

  if (isLoading) return <GLoadingState text="جارٍ تحميل خط المبيعات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'خط المبيعات' }} />
      <View style={{ flexDirection: 'row-reverse', paddingHorizontal: 12, paddingVertical: 10, gap: 6, flexWrap: 'nowrap' }}>
        <Pressable
          onPress={() => setActiveStage(null)}
          style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: !activeStage ? c.brand : c.surface, borderWidth: 1, borderColor: !activeStage ? c.brand : c.border }}
        >
          <Text style={{ fontSize: 12, color: !activeStage ? '#fff' : c.textMuted }}>الكل</Text>
        </Pressable>
        {STAGE_ORDER.map(stage => {
          const count = all.filter(o => o.stage === stage).length;
          const isActive = activeStage === stage;
          const color = STAGE_COLOR[stage] ?? '#94A3B8';
          return (
            <Pressable
              key={stage}
              onPress={() => setActiveStage(isActive ? null : stage)}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: isActive ? color : c.surface, borderWidth: 1, borderColor: isActive ? color : c.border, flexDirection: 'row', gap: 4, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 11, color: isActive ? '#fff' : c.textMuted }}>{STAGE_LABEL[stage] ?? stage}</Text>
              {count > 0 ? <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: isActive ? '#ffffff40' : color + '30', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 9, color: isActive ? '#fff' : color, fontWeight: '700' }}>{count}</Text>
              </View> : null}
            </Pressable>
          );
        })}
      </View>
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 12, gap: 10, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="funnel-outline" title="لا توجد فرص" description="" />}
        renderItem={({ item }) => {
          const stageColor = STAGE_COLOR[item.stage ?? ''] ?? '#94A3B8';
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/crm/opportunity-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border, borderRightWidth: 4, borderRightColor: stageColor }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
                <View style={{ backgroundColor: stageColor + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                  <Text style={{ fontSize: 11, color: stageColor, fontWeight: '600' }}>{STAGE_LABEL[item.stage ?? ''] ?? item.stage}</Text>
                </View>
              </View>
              {item.clientName ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{item.clientName}</Text> : null}
              <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 6 }}>
                {item.value != null ? (
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>
                    {item.value.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
                  </Text>
                ) : null}
                {item.probability != null ? (
                  <Text style={{ fontSize: 12, color: stageColor }}>{item.probability}%</Text>
                ) : null}
                {item.expectedClose ? (
                  <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.expectedClose)}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
