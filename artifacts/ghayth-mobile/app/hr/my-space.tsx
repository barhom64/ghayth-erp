/**
 * مساحتي الشخصية (لوحة الموظف)
 * GET /api/my-space
 */
import React from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { GCard, GLoadingState, GEmptyState, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { useRefresh } from '@/hooks/useRefresh';

interface MySpaceSummary {
  employeeName?: string;
  jobTitle?: string;
  department?: string;
  attendance?: { todayStatus?: string; thisMonthHours?: number; absences?: number };
  leaveBalance?: { annual?: number; sick?: number; emergency?: number };
  pendingRequests?: number;
  nextPayday?: string;
  performanceScore?: number;
}

export default function MySpaceScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError } = useList<MySpaceSummary>('/api/my-space');
  const { refreshing, onRefresh } = useRefresh([['/api/my-space']]);
  const space = Array.isArray(data) ? data[0] : data as MySpaceSummary | null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل بياناتك…" />;
  if (isError || !space) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={onRefresh} />
  );

  const shortcuts = [
    { label: 'الحضور', icon: 'finger-print-outline', route: '/hr/my-attendance' },
    { label: 'طلباتي', icon: 'document-text-outline', route: '/hr/my-requests' },
    { label: 'مستنداتي', icon: 'folder-open-outline', route: '/hr/my-documents' },
    { label: 'أدائي', icon: 'trending-up-outline', route: '/hr/my-performance' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مساحتي' }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <GCard>
          <Text style={{ fontSize: 20, fontWeight: '800', color: c.text, textAlign: 'right', marginBottom: 4 }}>
            {space.employeeName ?? '—'}
          </Text>
          <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'right' }}>
            {space.jobTitle ?? ''}{space.department ? ` • ${space.department}` : ''}
          </Text>
        </GCard>

        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {shortcuts.map(s => (
            <GButton
              key={s.label}
              title={s.label}
              variant="secondary"
              onPress={() => router.push(s.route as never)}
            />
          ))}
        </View>

        {space.attendance && (
          <GCard>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>الحضور</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 20 }}>
              {space.attendance.todayStatus && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>{space.attendance.todayStatus}</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>اليوم</Text>
                </View>
              )}
              {space.attendance.thisMonthHours != null && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{space.attendance.thisMonthHours}</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>ساعة هذا الشهر</Text>
                </View>
              )}
              {space.attendance.absences != null && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: space.attendance.absences > 0 ? '#EF4444' : c.text }}>
                    {space.attendance.absences}
                  </Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>غياب</Text>
                </View>
              )}
            </View>
          </GCard>
        )}

        {space.leaveBalance && (
          <GCard>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>أرصدة الإجازات</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 20 }}>
              {space.leaveBalance.annual != null && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#22C55E' }}>{space.leaveBalance.annual}</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>سنوية</Text>
                </View>
              )}
              {space.leaveBalance.sick != null && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#F59E0B' }}>{space.leaveBalance.sick}</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>مرضية</Text>
                </View>
              )}
              {space.leaveBalance.emergency != null && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#EF4444' }}>{space.leaveBalance.emergency}</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>طارئة</Text>
                </View>
              )}
            </View>
          </GCard>
        )}

        {(space.pendingRequests != null || space.performanceScore != null || space.nextPayday) && (
          <GCard>
            <View style={{ flexDirection: 'row-reverse', gap: 20 }}>
              {space.pendingRequests != null && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#F59E0B' }}>{space.pendingRequests}</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>طلبات قيد المراجعة</Text>
                </View>
              )}
              {space.performanceScore != null && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: c.brand }}>{space.performanceScore}%</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>الأداء</Text>
                </View>
              )}
            </View>
          </GCard>
        )}
      </ScrollView>
    </View>
  );
}
