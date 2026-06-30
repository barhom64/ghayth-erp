import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ProjectsModuleDashboard {
  projects?: { total?: number; active?: number; completed?: number; delayed?: number; avgProgress?: number };
  budget?: { totalBudget?: number; totalSpent?: number; overBudget?: number; variance?: number };
  tasks?: { total?: number; done?: number; blocked?: number; overdue?: number };
  [key: string]: unknown;
}

export default function ProjectsModuleDashboardScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<ProjectsModuleDashboard>('/api/module-dashboards/projects');
  const d = (data && !Array.isArray(data)) ? data as ProjectsModuleDashboard : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة المشاريع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const progress = d?.projects?.avgProgress ?? 0;
  const progressColor = progress >= 70 ? '#22C55E' : progress >= 40 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة المشاريع' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {/* Progress gauge */}
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center', borderTopWidth: 4, borderTopColor: progressColor }}>
          <Text style={{ fontSize: 40, fontWeight: '700', color: progressColor }}>{progress}%</Text>
          <Text style={{ fontSize: 13, color: c.textMuted }}>متوسط التقدم</Text>
        </View>
        {/* Projects */}
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>المشاريع</Text>
          <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
            {[
              { label: 'نشطة', value: d?.projects?.active ?? 0, color: c.brand },
              { label: 'مكتملة', value: d?.projects?.completed ?? 0, color: '#22C55E' },
              { label: 'متأخرة', value: d?.projects?.delayed ?? 0, color: '#EF4444' },
              { label: 'الإجمالي', value: d?.projects?.total ?? 0, color: c.text },
            ].map(m => (
              <View key={m.label} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: m.color }}>{m.value}</Text>
                <Text style={{ fontSize: 10, color: c.textMuted, textAlign: 'center' }}>{m.label}</Text>
              </View>
            ))}
          </View>
        </View>
        {/* Budget */}
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 8 }}>الميزانية</Text>
          <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 11, color: c.textMuted }}>الإجمالي</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: c.text }}>{(d?.budget?.totalBudget ?? 0).toLocaleString('ar-SA')} ر.س</Text>
          </View>
          <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 11, color: c.textMuted }}>المنفق</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#F59E0B' }}>{(d?.budget?.totalSpent ?? 0).toLocaleString('ar-SA')} ر.س</Text>
          </View>
          {(d?.budget?.overBudget ?? 0) > 0 ? (
            <Text style={{ fontSize: 12, color: '#EF4444', textAlign: 'right' }}>{d?.budget?.overBudget} مشروع تجاوز الميزانية</Text>
          ) : null}
        </View>
        {/* Tasks */}
        <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
          {[
            { label: 'منجزة', value: d?.tasks?.done ?? 0, color: '#22C55E' },
            { label: 'محجوبة', value: d?.tasks?.blocked ?? 0, color: '#F59E0B' },
            { label: 'متأخرة', value: d?.tasks?.overdue ?? 0, color: '#EF4444' },
          ].map(m => (
            <View key={m.label} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
