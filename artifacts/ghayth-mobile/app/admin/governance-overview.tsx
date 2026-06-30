import React from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PolicyAudit {
  domain?: string;
  totalPolicies?: number;
  violations?: number;
  status?: string;
}

interface RoleStrategy {
  role?: string;
  strategy?: string;
  assigneeCount?: number;
}

export default function GovernanceOverviewScreen() {
  const c = useColors();
  const r = useRouter();
  const policies = useList<PolicyAudit[]>('/api/admin/governance/policy-audit');
  const strategies = useList<RoleStrategy[]>('/api/admin/governance/role-strategies');

  const isLoading = policies.isLoading && strategies.isLoading;

  if (isLoading) return <GLoadingState text="جارٍ تحميل الحوكمة…" />;

  const polList = Array.isArray(policies.data) ? policies.data : [];
  const strList = Array.isArray(strategies.data) ? strategies.data : [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نظرة عامة على الحوكمة' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {polList.length > 0 && (
          <>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 8 }}>تدقيق السياسات</Text>
            {polList.map((p, i) => (
              <Pressable key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: c.text }}>{p.domain ?? '—'}</Text>
                <Text style={{ fontSize: 12, color: (p.violations ?? 0) > 0 ? '#EF4444' : '#22C55E' }}>{p.violations ?? 0} مخالفة</Text>
              </Pressable>
            ))}
          </>
        )}
        {strList.length > 0 && (
          <>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginTop: 12, marginBottom: 8 }}>استراتيجيات الأدوار</Text>
            {strList.map((s, i) => (
              <View key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: c.text, textAlign: 'right' }}>{s.role ?? '—'}</Text>
                  {s.strategy ? <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right' }}>{s.strategy}</Text> : null}
                </View>
                <Text style={{ fontSize: 12, color: c.brand }}>{s.assigneeCount ?? 0} مستخدم</Text>
              </View>
            ))}
          </>
        )}
        {polList.length === 0 && strList.length === 0 && <GEmptyState icon="shield-outline" title="لا توجد بيانات حوكمة" description="" />}
      </ScrollView>
    </View>
  );
}
