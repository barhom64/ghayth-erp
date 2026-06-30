import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface MasterPlanStatus {
  phase?: string;
  progress?: number;
  completedModules?: number;
  totalModules?: number;
  status?: string;
  nextMilestone?: string;
  [key: string]: unknown;
}

export default function MasterPlanScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<MasterPlanStatus>('/api/admin/master-plan/status');
  const d = (data && !Array.isArray(data)) ? data as MasterPlanStatus : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل حالة الخطة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const progress = d?.progress ?? 0;
  const progressColor = progress >= 80 ? '#22C55E' : progress >= 50 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الخطة الرئيسية' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: progressColor }}>
          <Text style={{ fontSize: 48, fontWeight: '700', color: progressColor }}>{progress}%</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>نسبة الإنجاز</Text>
          {d?.phase ? <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 2 }}>المرحلة: {d.phase}</Text> : null}
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
          {d?.completedModules != null ? (
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 6 }}>
              <Text style={{ fontSize: 13, color: c.textMuted }}>الوحدات المكتملة</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{d.completedModules} / {d.totalModules ?? '?'}</Text>
            </View>
          ) : null}
          {d?.nextMilestone ? (
            <>
              <View style={{ height: 1, backgroundColor: c.border }} />
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 6 }}>
                <Text style={{ fontSize: 13, color: c.textMuted }}>المعلم التالي</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{d.nextMilestone}</Text>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
